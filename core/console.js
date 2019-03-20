const job = require('./job');
const {handleError, handleCatch} = require('./app');
const nginx = require('./nginx');
const auth = require('./auth');
const letsencrypt = require('./letsencrypt');

function end (type = 0) {
    process.exit(type);
}

async function main (cmd) {
    switch (cmd) {
        case 'job':
            const id = process.argv[3] || '';
            if (id) {
                await job.run(id).catch(handleCatch);
            }
            break;
        case 'renew':
            await letsencrypt.checkRenewal().catch(handleCatch);
            break;
        case 'update':
            await nginx.update().catch(handleCatch);
            break;
        case 'token':
            console.log(await auth.generate());
            break;
        case 'nginx:init':
            await nginx.init();
            break;
    }
}

try {
    main(process.argv[2] || '')
        .then(end)
        .catch(e => {
            handleError(e);
            end(1);
        });
} catch (e) {
    handleError(e);
    end(1);
}
