FROM node:11

ADD . /app/
WORKDIR /app/

RUN chmod +x /app/manager/entrypoint.sh \
    && apt-get update \
    && apt-get -y install nano \
    && apt-get -y install openssl \
    && wget https://dl.eff.org/certbot-auto \
    && chmod a+x certbot-auto \
    && rm -rf /app/node_modules \
    && cd /app && npm install

RUN touch /var/log/letsencrypt.log

ENTRYPOINT ["bash", "/app/manager/entrypoint.sh", "2>&1"]
