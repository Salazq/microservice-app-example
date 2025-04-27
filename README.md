# Team members:
- Juan Camilo Salazar
- Samuel Gutierrez

# Microservices Application

This is an application taken from [bortizf](https://github.com/bortizf/microservice-app-example) based on microservices written in different programming languages or frameworks. Various modifications were made to implement two cloud patterns (API Gateway and rate limiting) and to achieve deployment with Azure using one infrastructure pipeline and five development pipelines (one for each microservice).

**Note**: The workshop is divided between the development part (this repository) and the infrastructure part ([infrastructure repository](https://github.com/Salazq/microservice-app-example-deployments))


## Architecture

![image](https://github.com/user-attachments/assets/7ba03009-f55b-4fb0-a5e2-1bd406691fdf)

## Branching Strategy
### Development (GitFlow)
For our development workflow, we've chosen GitFlow because it provides a structured approach that helps us manage our microservices independently while maintaining a stable codebase. The clear separation between feature branches and our main branches allows our small team to work simultaneously on different components without stepping on each other's toes, while the dedicated develop branch gives us a safe integration point before pushing changes to production.

### Operations (GitHub Flow)
For our operations work, we've implemented GitHub Flow as it streamlines our infrastructure and deployment processes with a single long-lived main branch and feature branches that are short-lived and merged through pull requests. This approach supports our need for continuous deployment while ensuring all infrastructure changes are reviewed before implementation, which is perfect for our small team that needs to maintain infrastructure quality without complex release cycles or heavy process overhead.


## Container Configuration:

To achieve cloud deployment, dockerfiles were created for each of the microservices. These are found within their corresponding folders. For example, for the frontend, the base node image, package installation, build, and application initialization were defined:

```
FROM node:8.17.0

WORKDIR /app

COPY package*.json ./  
RUN npm install        

COPY . .             
RUN npm run build     

EXPOSE 8080

CMD ["npm", "start"]
```

To integrate the dockerfiles for each microservice, a [docker-compose](Docker-compose.yml) file was built where it was defined how each should be built, the variables it receives, the ports it uses, and the communication network (one was created for all containers). For example, for users-api:

```
users-api:
  build:
    context: ./users-api
  container_name: users-api
  environment:
    - SERVER_PORT=8083
    - JWT_SECRET=PRFT
  ports:
    - "8083:8083"
  depends_on:
    - auth-api
  networks:
    - app-network
...

networks:
  app-network:
    driver: bridge
```

Additionally, containers for Redis and Zipkin are created here to store messages and to trace operations respectively, as they are needed by the microservices:

```
 # Redis for cache storage and messaging
 redis:
   image: redis:7.0
   container_name: redis
   ports:
     - "6379:6379"
   networks:
     - app-network

# Zipkin for traceability
  zipkin:
    image: openzipkin/zipkin
    container_name: zipkin
    networks:
      - app-network
    ports:
      - "9411:9411"
```

## Implemented Patterns:

### 1. Gateway Routing:
The implementation can be seen in [Nginx](/nginx) where the configuration file is located, which was used to set up an nginx container that routes application requests:

```
server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://frontend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
....
server {
    listen 8000;
    server_name localhost;

    location /login {     
        proxy_pass http://auth-api:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
...
```

Two servers were set up on different ports, the first for the frontend and the second for the backend microservices (for greater security). This way, the user accesses port 80 that nginx listens to, and nginx routes to the address set for the frontend. Similarly, the frontend communicates with nginx when it wants to make requests to the other microservices and is routed to the correct address. This latter configuration can be seen in the [compose](Docker-compose.yml):

```
  frontend:
    build:
      context: ./frontend
    container_name: frontend
    environment:
      - PORT=8080
      # Point to backend services through Nginx port 8000
      - AUTH_API_ADDRESS=http://nginx:8000
      - TODOS_API_ADDRESS=http://nginx:8000
      - USERS_API_ADDRESS=http://nginx:8000
      - ZIPKIN_URL=http://nginx:8000
    networks:
      - app-network
```

### 2. Rate limiting:

To prevent abuse of the API provided by Auth-api for login, the rate limiting pattern was also implemented with nginx. First, a [limitation zone](nginx/rate_limit.conf) of 5 requests per minute was defined, along with a "too many requests" error that is thrown when this limit is exceeded:

```
limit_req_zone $http_x_forwarded_for zone=login_limit:10m rate=5r/m;

limit_req_status 429;  # "Too Many Requests" Error
```

Then, a "limit_req" was used with the previously defined limitation zone in the routing to "login", in addition to adding headers with the real IP (because otherwise they would be lost between routings):

```
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

location /login {
    limit_req zone=login_limit burst=3 nodelay;
   
    proxy_pass http://auth-api:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Infrastructure: [infrastructure repository](https://github.com/Salazq/microservice-app-example-deployments)

To deploy the containers in the cloud, it was decided to set up an Azure virtual machine with the help of Terraform, which can be seen in the [terraform folder](https://github.com/Salazq/microservice-app-example-deployments/tree/main/terraform). For this, the configurations proposed by Microsoft at https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-terraform?tabs=azure-cli were used as a reference, only changing the authorization to use a fixed username and password (instead of authorization by public and private key) and opening port 80 (which is used by nginx):

```
  security_rule {
    name                       = "HTTP"
    priority                   = 300
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
```

To install Docker and clone the repository on the virtual machine, Ansible was used. The configuration can be seen in the [ansible folder](https://github.com/Salazq/microservice-app-example-deployments/tree/main/ansible-deploy). SSH connection variables to the VM were defined as follows:

```
[azure_vm]
0.0.0.0 ansible_user=<user> ansible_ssh_pass=<password> 
```

and three roles:

```
- hosts: azure_vm
  become: yes
  roles:
    - docker_install
    - pip_install
    - docker_compose
```

To install Docker, install the necessary dependencies, and clone the repository.

## Pipelines and scripts:

Eight pipelines were defined, one to deploy the infrastructure, one to tear down the infrastructure, one for nginx, and one for each microservice, as can be seen below:

![image](https://github.com/user-attachments/assets/d39561d3-8ac1-423f-8eb1-00212c561a2a)

- [Infrastructure-up](https://github.com/Salazq/microservice-app-example-deployments/blob/main/azure-pipelines.yml): runs Terraform (sets up the VM) and with the newly generated IP runs Ansible (installs dependencies and clones the repository)
- [Infrastructure-down](https://github.com/Salazq/microservice-app-example-deployments/blob/main/azure-pipelines-1.yml): removes the Azure resource group corresponding to the VM.
- [todos-api](azure-pipelines-4.yml), [frontend](azure-pipelines.yml), [users-api](azure-pipelines-1.yml), [auth-api](azure-pipelines-2.yml), [log-message-processor](azure-pipelines-3.yml) and [nginx](azure-pipelines-5.yml): build the application in the Azure environment, access the VM via SSH, pull the repository, bring down the corresponding container, rebuild it, and bring it back up.

## Execution
### Local
1. Position yourself in the root folder and run:
```
 docker-compose up -d     
```
2. Access port 80 to use the application.

### In the cloud (Azure pipelines)
1. Create the 8 pipelines mentioned in the previous section using the corresponding "yaml" and pointing to the corresponding  repository.
2. Create a variable group called: "variable-group-taller".
3. Create and assign the following variables:
```
AZURE_ACCOUNT
RESOURCE_GROUP
VM_NAME
VM_PASSWORD
VM_USERNAME
```
4. Run Infrastructure-up to deploy the application and Infrastructure-down to tear it down.
5. Each time a change is made to a microservice, the corresponding pipeline will be triggered.




