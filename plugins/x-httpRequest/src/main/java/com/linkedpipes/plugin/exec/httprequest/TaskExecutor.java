package com.linkedpipes.plugin.exec.httprequest;

import com.linkedpipes.etl.dataunit.core.files.WritableFilesDataUnit;
import com.linkedpipes.etl.executor.api.v1.LpException;
import com.linkedpipes.etl.executor.api.v1.component.task.TaskConsumer;
import com.linkedpipes.etl.executor.api.v1.service.ExceptionFactory;
import com.linkedpipes.etl.executor.api.v1.service.ProgressReport;
import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

class TaskExecutor implements TaskConsumer<HttpRequestTask> {

    private static final Logger LOG =
            LoggerFactory.getLogger(TaskExecutor.class);

    private final ExceptionFactory exceptionFactory;

    private final WritableFilesDataUnit outputFiles;

    private final TaskContentWriter taskContentWriter;

    private HeaderReporter headerReporter;

    private ProgressReport progressReport;

    public TaskExecutor(
            ExceptionFactory exceptionFactory,
            WritableFilesDataUnit outputFiles,
            Map<String, File> inputFilesMap,
            StatementsConsumer consumer,
            ProgressReport progressReport) {
        this.exceptionFactory = exceptionFactory;
        this.outputFiles = outputFiles;
        this.taskContentWriter = new TaskContentWriter(
                exceptionFactory, inputFilesMap);
        this.headerReporter = new HeaderReporter(consumer);
        this.progressReport = progressReport;
    }

    @Override
    public void accept(HttpRequestTask task) throws LpException {
        LOG.info("Executing '{}' on '{}' to '{}'", task.getMethod(),
                task.getUrl(), task.getOutputFileName());
        try (Connection connection = createConnection(task)) {
            connection.finishRequest();
            checkStatus(connection);
            HttpURLConnection urlConnection = connection.getConnection();
            saveHeaders(urlConnection, task);
            saveFileResponse(urlConnection, task);
        } catch (Exception ex) {
            throw exceptionFactory.failure("Can't create connection.", ex);
        } finally {
            progressReport.entryProcessed();
        }
    }

    private Connection createConnection(HttpRequestTask task)
            throws IOException, LpException {
        // TODO Add support for single body request.
        HttpURLConnection connection = createHttpConnection(task);
        if (task.getContent().isEmpty()) {
            return wrapConnection(connection);
        } else {
            return wrapMultipart(connection, task);
        }
    }

    private HttpURLConnection createHttpConnection(HttpRequestTask task)
            throws IOException {
        URL url = new URL(task.getUrl());
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(task.getMethod());
        for (HttpRequestTask.Header header : task.getHeaders()) {
            connection.setRequestProperty(header.getName(), header.getValue());
        }
        return connection;
    }

    private Connection wrapConnection(HttpURLConnection connection) {
        return new Connection(connection);
    }

    private Connection wrapMultipart(
            HttpURLConnection connection, HttpRequestTask task)
            throws IOException, LpException {
        MultipartConnection multipartConnection =
                new MultipartConnection(connection);
        taskContentWriter.addTaskContent(multipartConnection, task);
        return multipartConnection;
    }

    private void checkStatus(Connection connection)
            throws IOException, LpException {
        if (connection.requestFailed()) {
            throw exceptionFactory.failure("Request failed with status: {}",
                    connection.getResponseCode());
        }
    }

    private void saveHeaders(
            HttpURLConnection connection, HttpRequestTask task)
            throws LpException {
        if (task.isOutputHeaders()) {
            headerReporter.reportHeaderResponse(connection, task);
        }
    }

    private void saveFileResponse(
            HttpURLConnection connection, HttpRequestTask task)
            throws LpException, IOException {
        String fileName = task.getOutputFileName();
        if (fileName == null || fileName.isEmpty()) {
            return;
        }
        File outputFile = this.outputFiles.createFile(fileName);
        try (InputStream stream = connection.getInputStream()) {
            FileUtils.copyToFile(stream, outputFile);
        }
    }

}