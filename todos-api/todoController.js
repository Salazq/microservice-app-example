'use strict';
const cache = require('memory-cache');
const { Annotation, jsonEncoder: { JSON_V2 } } = require('zipkin');
const CircuitBreaker = require('opossum');

const OPERATION_CREATE = 'CREATE',
      OPERATION_DELETE = 'DELETE';

// Configuración del Circuit Breaker
const circuitBreakerOptions = {
  timeout: 3000, // tiempo en ms para considerar una operación como fallida
  errorThresholdPercentage: 50, // porcentaje de errores para abrir el circuito
  resetTimeout: 10000, // tiempo para reintentar cerrar el circuito (10 segundos)
  rollingCountTimeout: 10000, // ventana de tiempo para calcular el porcentaje de errores
  rollingCountBuckets: 10, // número de buckets para calcular el porcentaje de errores
  name: 'redis-publish' // nombre del circuit breaker
};

class TodoController {
    constructor({tracer, redisClient, logChannel}) {
        this._tracer = tracer;
        this._redisClient = redisClient;
        this._logChannel = logChannel;
        
        // Creamos una función que encapsula la publicación en Redis
        this._publishToRedis = (channel, message) => {
            return new Promise((resolve, reject) => {
                this._redisClient.publish(channel, message, (err, result) => {
                    if (err) {
                        console.error('Error publicando en Redis:', err);
                        return reject(err);
                    }
                    resolve(result);
                });
            });
        };
        
        // Creamos el circuit breaker para la publicación en Redis
        this._redisCircuitBreaker = new CircuitBreaker(this._publishToRedis, circuitBreakerOptions);
        
        // Configuramos los listeners del circuit breaker para logging
        this._redisCircuitBreaker.on('open', () => console.log('Circuit Breaker abierto - Redis no disponible'));
        this._redisCircuitBreaker.on('halfOpen', () => console.log('Circuit Breaker probando si Redis está disponible'));
        this._redisCircuitBreaker.on('close', () => console.log('Circuit Breaker cerrado - Redis disponible'));
        this._redisCircuitBreaker.on('fallback', (result) => console.log('Usando fallback para operación de Redis'));
        this._redisCircuitBreaker.on('timeout', (result) => console.log('Timeout alcanzado en operación de Redis'));
        this._redisCircuitBreaker.on('reject', () => console.log('Circuit Breaker rechazó la operación - circuito abierto'));
        this._redisCircuitBreaker.on('success', (result) => console.log('Operación en Redis exitosa'));
        this._redisCircuitBreaker.on('failure', (error) => console.error('Error en operación de Redis:', error));
    }

    list(req, res) {
        const data = this._getTodoData(req.user.username)
        res.json(data.items)
    }

    create(req, res) {
        const data = this._getTodoData(req.user.username)
        const todo = {
            content: req.body.content,
            id: data.lastInsertedID
        }
        data.items[data.lastInsertedID] = todo

        data.lastInsertedID++
        this._setTodoData(req.user.username, data)

        this._logOperation(OPERATION_CREATE, req.user.username, todo.id)
            .catch(err => console.error('Error al registrar operación CREATE:', err));

        res.json(todo)
    }

    delete(req, res) {
        const data = this._getTodoData(req.user.username)
        const id = req.params.taskId
        delete data.items[id]
        this._setTodoData(req.user.username, data)

        this._logOperation(OPERATION_DELETE, req.user.username, id)
            .catch(err => console.error('Error al registrar operación DELETE:', err));

        res.status(204)
        res.send()
    }

    async _logOperation(opName, username, todoId) {
        return this._tracer.scoped(async () => {
            const traceId = this._tracer.id;
            const mensaje = JSON.stringify({
                zipkinSpan: traceId,
                opName: opName,
                username: username,
                todoId: todoId,
            });
    
            console.log(`Publicando en Redis [canal: ${this._logChannel}]:`, mensaje);
            
            // Usamos el circuit breaker para enviar el mensaje a Redis con reintentos
            try {
                // El primer argumento es para el método publish y el segundo es el mensaje
                await this._redisCircuitBreaker.fire(this._logChannel, mensaje);
                console.log('Mensaje publicado exitosamente en Redis');
                return true;
            } catch (error) {
                console.error('No se pudo publicar el mensaje después de varios intentos:', error);
                // Aquí podrías implementar un fallback, como guardar en un log local
                return false;
            }
        });
    }

    _getTodoData(userID) {
        var data = cache.get(userID)
        if (data == null) {
            data = {
                items: {
                    '1': {
                        id: 1,
                        content: "Create new todo",
                    },
                    '2': {
                        id: 2,
                        content: "Update me",
                    },
                    '3': {
                        id: 3,
                        content: "Delete example ones",
                    }
                },
                lastInsertedID: 3
            }

            this._setTodoData(userID, data)
        }
        return data
    }

    _setTodoData(userID, data) {
        cache.put(userID, data)
    }
}

module.exports = TodoController