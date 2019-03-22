const exec = require('child_process').exec;
const fs = require('fs');
const path = require('path');

const serverType = (process.mainModule.filename.indexOf('server.js') !== -1 ? 'manager' : 'server');

exports.timestamp = function () {
    return Math.floor(new Date() / 1000);
};

exports.handleError = function (e) {
    console.log('Error:');
    console.log(e);
    let message = e;
    if (message instanceof Error) {
        message = e;
    }
    this.log('Error:', message);
    return false;
};

exports.handleCatch = function (e) {
    console.log('Silent Error:');
    console.log(e);
    return false;
};

exports.log = function (...message) {
    message = message.map(i => typeof i === 'object' ? JSON.stringify(i, null, 4) : i).join('\n') + '\n';
    let log = '[' + serverType + ']: ';
    log += message;
    fs.appendFileSync(path.join('/var/log/nginx-letsencrypt.log'), log);
    process.stdout.write(message);
};

exports.env = function (key, defaultValue = null) {
    return process.env[key] || defaultValue;
};

exports.error = function (message, description = null) {
    throw new Error(JSON.stringify({
        message: message,
        description: description
    }));
};

exports.parseError = function (error) {
    if (typeof error === 'object' && error._custom !== undefined) {
        return error;
    }

    let response = {
        _custom: true,
        message: error,
        description: null
    };
    if (error instanceof Error) {
        try {
            const parsed = JSON.parse(error.message);
            response.message = parsed.message;
            response.description = parsed.description;
        } catch (e) {}
    }
    return response;
};

exports.execute = function (command) {
    return new Promise((resolve) => {
        console.log('Execute:', command);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                this.handleError(error);
                resolve(stderr);
            } else {
                resolve(stdout);
            }
        });
    });
};

exports.randomStr = function (length = 32, special = false) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    if (special) {
        possible += '$*()&%#!+=';
    }
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};
