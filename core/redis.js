
const redis = require('redis');
const {promisify} = require('util');
const {env} = require('./app');

const params = {
    host: env('REDIS_HOST', 'redis'),
    port: env('REDIS_PORT', 6379),
    prefix: 'senl:'
};

function createClient (params) {
    params.retry_strategy = function (options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
    };
    const client = redis.createClient(params);

    return {
        get: promisify(client.get).bind(client),
        set: promisify(client.set).bind(client),
        del: promisify(client.del).bind(client),
        sAdd: promisify(client.sadd).bind(client),
        sRem: promisify(client.srem).bind(client),
        sMembers: promisify(client.smembers).bind(client),
        on: client.on.bind(client),
        publish: client.publish.bind(client),
        subscribe: client.subscribe.bind(client)
    };
}

exports.channel = 'nginx-letsencrypt';
exports.publisher = createClient(params);
exports.subscriber = createClient(params);

/**
 * @deprecated
 * @param key
 * @returns {string}
 */
exports.key = function (key) {
    return key;
};
