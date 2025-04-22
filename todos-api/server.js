'use strict';
const express = require('express')
const bodyParser = require("body-parser")
const jwt = require('express-jwt')
const redis = require("redis");

const ZIPKIN_URL = process.env.ZIPKIN_URL || 'http://127.0.0.1:9411/api/v2/spans';
const {Tracer, 
  BatchRecorder,
  jsonEncoder: {JSON_V2}} = require('zipkin');
const CLSContext = require('zipkin-context-cls');  
const {HttpLogger} = require('zipkin-transport-http');
const zipkinMiddleware = require('zipkin-instrumentation-express').expressMiddleware;

const logChannel = process.env.REDIS_CHANNEL || 'log_channel';

// Configuración mejorada de Redis con reintentos
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retry_strategy: function (options) {
      if (options.error) {
          if (options.error.code === 'ECONNREFUSED') {
              console.error('Redis server refused connection. Retrying...');
              return Math.min(options.attempt * 500, 5000); // Espera exponencial con un máximo de 5 segundos
          }
          if (options.error.code === 'ECONNRESET') {
              console.error('Connection to Redis reset. Retrying...');
              return Math.min(options.attempt * 500, 5000);
          }
      }
      if (options.total_retry_time > 1000 * 60 * 5) { // 5 minutos de reintento máximo
          console.error('Redis retry time exhausted. Giving up...');
          return new Error('Retry time exhausted');
      }
      if (options.attempt > 20) {
          console.error('Too many Redis connection attempts. Giving up...');
          return new Error('Too many retries');
      }
      // Espera exponencial con un poco de aleatoriedad para prevenir thundering herd
      return Math.min(Math.random() * 200 + options.attempt * 300, 3000);
  }        
});

// Manejadores de eventos para Redis
redisClient.on('connect', () => {
  console.log('Redis client connected');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('reconnecting', (params) => {
  console.log(`Redis client reconnecting. Attempt: ${params.attempt}, Total retry time: ${params.total_retry_time}ms`);
});

// El resto del código sigue igual
const port = process.env.TODO_API_PORT || 8082
const jwtSecret = process.env.JWT_SECRET || "foo"

const app = express()

// tracing
const ctxImpl = new CLSContext('zipkin');
const recorder = new BatchRecorder({
  logger: new HttpLogger({
    endpoint: ZIPKIN_URL,
    jsonEncoder: JSON_V2
  })
});
const localServiceName = 'todos-api';
const tracer = new Tracer({ctxImpl, recorder, localServiceName});

app.use(jwt({ secret: jwtSecret }))
app.use(zipkinMiddleware({tracer}));
app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send({ message: 'invalid token' })
  }
})
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

const routes = require('./routes')
routes(app, {tracer, redisClient, logChannel})

app.listen(port, function () {
  console.log('todo list RESTful API server started on: ' + port)
})