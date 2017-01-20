# Baasil

Baasil stands for "Backend as a Service is lame" - Its goal is to provide the same simplicity as BaaS solutions but without compromising flexibility and without the lock-in factor and associated costs.

More concretely, Baasil is a command line tool for creating auto-scalable app boilerplates on your local machine and deploying them to any Rancher Kubernetes environment with a single command.
Other Kubernetes environments may be supported in the future, but right now it's just Rancher.
The main difference between environments tends to be the load balancer.

Right now, the only boilerplate/framework supported is SCC; see SocketCluster (http://socketcluster.io/) but we hope to add more in the future (and maybe turn this project into a package manager for Kubernetes-based frameworks - So feel free to get involved!).

SCC is a scalable SocketCluster boilerplate/framework which is designed from the ground up to run natively on Rancher/Kubernetes.
It can scale across any number of hosts to support millions of concurrent users without having to change any code.
Currently, it doesn't support any database so you should use an external DB service if you need to store persistent state - Other than that, it's ideal for building
your own stateless pub/sub service.


### Requirements

You need to have the following installed on your host to be able to use Baasil:

- Node.js https://nodejs.org/
- Docker https://docs.docker.com/engine/installation/
- kubectl (Kubernetes client) If you're running Linux, you can download the binaries https://coreos.com/kubernetes/docs/latest/configure-kubectl.html (don't worry about configuring kubectl though). On OSX, the easiest way is to install with the command brew install kubernetes-cli. If you have issues with the previous steps, you can also follow the instructions here: http://kubernetes.io/docs/getting-started-guides/binary_release/

You also need access to the following:

- Any Rancher control panel configured with Kubernetes - You can deploy your own Rancher panel on Amazon AWS (EC2) https://aws.amazon.com/ - Or if you're too lazy to setup your own, we offer access to a shared Rancher panel on https://baasil.io/ (currently in Beta).
- Any Docker image repository - We recommend DockerHub https://hub.docker.com/


### Installation

You can install Baasil using:

```
sudo npm install -g baasil
```

You can setup and run your SCC app locally by following these instructions: https://docs.baasil.io/running_your_app_locally.html

Then, to create your Rancher/K8s infrastructure and deploy your app to it, you should continue reading: https://docs.baasil.io/creating_your_kubernetes_cluster_on_ec2.html
