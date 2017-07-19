SocketCluster Source Code Volume
======

This directory contains source code which can be attached to SocketCluster containers
(https://hub.docker.com/r/socketcluster/socketcluster/) - This allows you to modify
SocketCluster without having to rebuild or redeploy SocketCluster itself.

When you execute `baasil run` while inside this directory, a SocketCluster container instance
will be launched and use the files in this directory as its source code.
There is a file watcher in the SocketCluster container, so by default, if you modify any
file inside this directory, SocketCluster workers which are running inside the container
will reboot themselves using the fresh source code (so you only need to use `baasil run` once).

When you run `baasil deploy` or `baasil deploy-update`, all the files in this directory will be
copied into a volume container which will be independently pushed to your container registry (e.g. DockerHub)
and then later attached to one or more SocketCluster container instances which will be launched on your K8s cluster.

Note that the SocketCluster container instance has its own node_modules/ directory which contains all the dependencies
required to run SocketCluster. You can create your own node_modules/ directory in this directory to hold additional
Node.js modules; then you can reference them in your code as normal using the `require` syntax: `var myModule = require('myModule')`.

If you have any issues with building Node.js modules, see comments in the Dockerfile.
