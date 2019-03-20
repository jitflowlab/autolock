const fetch = require('node-fetch');
const app = require('./app');
const redis = require('./redis');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

const certificates = ['cert.pem', 'chain.pem', 'fullchain.pem', 'privkey.pem'];

async function getCertParent (domain) {
    return redis.publisher.get('certs:' + domain + ':parent');
}

async function checkDomain (domain) {
    const request = await fetch('http://' + domain + '/heartbeat').catch(app.handleCatch);
    if (!request) {
        return false;
    }
    const data = await request.json().catch(app.handleCatch);
    if (!data) {
        return false;
    }
    return data.success !== undefined;
}

exports.getCert = async function (domain) {
    const parentCert = await getCertParent(domain);
    if (!parentCert) {
        return false;
    }
    let cert = await redis.publisher.get('certs:' + domain);
    if (!cert) {
        return false;
    }
    cert = JSON.parse(cert);
    cert.keys = {
        'dhparam.pem': fs.readFileSync(
            path.join('/app/manager/letsencrypt/dhparam.pem'),
            'utf-8'
        )
    };
    for (let certificate of certificates) {
        const key = 'keys:' + cert.parent + ':' + certificate;
        let certData = await redis.publisher.get(key);
        if (certData) {
            certData = JSON.parse(certData);
            cert.keys[certificate] = certData.certificate;
        }
    }

    return cert;
};

exports.getCerts = async function () {
    const certs = {};
    const members = await redis.publisher.sMembers('certs');
    for (let member of members) {
        const cert = await this.getCert(member);
        if (cert) {
            certs[member] = cert;
        }
    }
    return certs;
};

exports.checkRenewal = async function () {
    const certs = await this.getCerts();
    for (let key of Object.keys(certs)) {
        const cert = certs[key];
        const oneMonth = moment.unix(cert.created).add(1, 'month');
        if (!moment().isAfter(oneMonth)) {
            app.log('Renewing:', cert.domain, cert.email);
        }
    }
};

exports.certbot = async function ({email, domain, force = false}) {
    const checkDomains = domain.split(',').map(i => i.trim());
    const activeCerts = await this.getCerts();
    app.log('activeCerts', activeCerts);
    if (activeCerts[checkDomains[0]] !== undefined && force === false) {
        throw new Error('DOMAIN_ALREADY_EXISTS');
    }
    let domains = '';
    let success = [];
    let fail = [];
    let debug = false;
    app.log('checkDomains', checkDomains);
    for (let item of checkDomains) {
        const req = await checkDomain(item);
        if (!req) {
            fail.push(item);
            continue;
        }
        success.push(item);
        domains += ' -d ' + item;
    }

    if (fail.length) {
        throw new Error('DOMAIN_DNS_FAILED');
    }

    // console.log(domains);
    const cmd = '/app/certbot-auto certonly -t --agree-tos ' +
        '-m ' + email + ' -n ' +
        '--expand ' +
        (force === false ? '' : '--force-renewal ') +
        (debug ? '--test-cert ' : '') +
        '--webroot -w /app/manager/public ' +
        domains;

    const response = await app.execute(cmd);
    app.log('certbot response:', response);
    if (response.indexOf('The following errors were reported by the server') !== -1) {
        throw new Error('DOMAIN_DNS_FAILED');
    }
    const parentCert = success[0];
    const baseDir = path.join(`/etc/letsencrypt/live/${parentCert}`);
    if (fs.existsSync(baseDir)) {
        for (let certName of certificates) {
            const certFile = path.join(baseDir, certName);
            if (!fs.existsSync(certFile)) {
                app.log('Missing cert file: ' + certFile);
                continue;
            }
            app.log('Adding cert file: ' + certFile);
            await redis.publisher.set('keys:' + parentCert + ':' + certName, JSON.stringify({
                certificate: fs.readFileSync(
                    certFile,
                    'utf-8'
                )
            }));
        }
    }
    for (let item of success) {
        const cert = {
            domain: item,
            parent: parentCert,
            created: app.timestamp(),
            email: email
        };
        await redis.publisher.set('certs:' + item, JSON.stringify(cert)).catch(app.handleCatch);
        await redis.publisher.set('certs:' + item + ':parent', parentCert).catch(app.handleCatch);
        await redis.publisher.sAdd('certs', item).catch(app.handleCatch);
    }
    return {
        domains: success,
        response: response
    };
};
