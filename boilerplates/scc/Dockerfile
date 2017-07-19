FROM node:8.1.2-slim

LABEL description="Volume container which holds source code for an SCC app or service."

RUN mkdir -p /usr/src/
WORKDIR /usr/src/
COPY . /usr/src/

# If you have a node_modules/ directory which contains dependencies which require
# compilation, you should:
# 1. Add 'node_modules/' to the .dockerignore file in this directory.
# 2. Uncomment the following line:
# RUN npm install .

# Since this is just a volume container, we don't need to run any init commands.
CMD ["sleep", "infinity"]
