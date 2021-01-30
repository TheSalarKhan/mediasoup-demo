FROM node:10 AS stage-one

# Install DEB dependencies and others.
RUN \
	set -x \
	&& apt-get update \
	&& apt-get install -y net-tools build-essential

WORKDIR /service

COPY package.json .
RUN npm install
COPY server.js .
COPY config.js .
COPY lib lib

CMD ["node", "/service/server.js"]
