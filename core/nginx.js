const fs = require('fs');
const path = require('path');
const app = require('./app');
const letsencrypt = require('./letsencrypt');

const cwd = process.cwd();
const serverConf = path.join('/etc/nginx/nginx.conf');
const defaultConf = path.join('/etc/nginx/conf.d/default.conf');

async function reload () {
    const r = await app.execute('nginx -t');
    const reload = await app.execute('nginx -s reload');
    app.log(r, reload);
}

async function getConf () {
    let conf = fs.readFileSync(
        path.join(cwd, '/server/nginx/default.conf'), 'utf-8'
    );
    conf = conf.replace(/{{MANAGER_SERVER}}/g, app.env('MANAGER_SERVER'));

    return conf;
}

async function addDomain (cert) {
    const domain = cert.domain;
    const mapping = {
        'privkey.pem': domain + '.key',
        'fullchain.pem': domain + '.crt',
        'dhparam.pem': domain + '.dhparam.pem'
    };
    for (let key of Object.keys(mapping)) {
        const fileName = mapping[key];
        fs.writeFileSync(
            path.join('/etc/nginx/certs', fileName),
            cert.keys[key],
            'utf-8'
        );
    }
    /* eslint-disable */
    const template = `
upstream ${domain} {
    # Access through rancher managed network
    server ${app.env('UPSTREAM_HOST', 'localhost')}:${app.env('UPSTREAM_PORT', '8080')};

    server localhost down;
}

server {
    server_name ${domain};
    listen 80 ;
    access_log /var/log/nginx/access.log vhost;
    location / {
        return 301 https://$host:443$request_uri;
    }
}

server {
    server_name ${domain};
    listen 443 ssl http2 ;
    access_log /var/log/nginx/access.log vhost;

    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:!DSS';

    ssl_prefer_server_ciphers on;
    ssl_session_timeout 5m;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    ssl_certificate /etc/nginx/certs/${domain}.crt;
    ssl_certificate_key /etc/nginx/certs/${domain}.key;
    ssl_dhparam /etc/nginx/certs/${domain}.dhparam.pem;
    add_header Strict-Transport-Security "max-age=31536000";

    location / {
        proxy_pass http://${domain};
    }
}    
    `;
    /* eslint-enable */
    return template;
}

exports.init = async function () {
    fs.writeFileSync(defaultConf, await getConf(), 'utf-8');

    let conf = fs.readFileSync(
        serverConf, 'utf-8'
    );
    const keys = {
        'server_names_hash_bucket_size': 128,
        'server_tokens': 'off'
    };
    let extra = '';
    for (let key of Object.keys(keys)) {
        const reg = new RegExp('' + key + ' ' + keys[key] + ';', 'gs');
        conf = conf.replace(reg, '');
        extra += '\n\t' + key + ' ' + keys[key] + ';';
    }
    conf = conf.replace(/http {/g, 'http {' + extra);
    fs.writeFileSync(serverConf, conf, 'utf-8');
    app.log('Init:', ' -> ' + defaultConf, ' -> ' + serverConf);
};

exports.update = async function () {
    let template = await getConf();
    template += '\n# Auto-generated \n\n';
    let certs = await letsencrypt.getCerts();
    app.log('Updating nginx default conf: ' + defaultConf);
    for (let domain of Object.keys(certs)) {
        const cert = certs[domain];
        app.log(' -> ' + cert.domain + '[' + cert.parent + ']');
        template += await addDomain(cert);
    }

    fs.writeFileSync(defaultConf, template, 'utf-8');
    await reload().catch(app.handleError);

    return template;
};
