/* eslint-env jest */
const restify = require('restify');
const request = require('supertest');
const signature = require('cookie-signature');
const cookieParser = require('cookie-parser');
const async = require('async');
const {
  random,
} = require('faker');

const {
  celebrate,
  Joi,
  Segments,
} = require('../lib');

const Server = () => {
  const server = restify.createServer();
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser({
    requestBodyOnGet: true,
  }));
  server.use(cookieParser());
  return server;
};

describe('validations', () => {
  test('req.headers', async (done) => {
    const next = jest.fn();
    const server = Server();

    server.get('/', celebrate({
      [Segments.HEADERS]: {
        accept: Joi.string().regex(/xml/),
      },
    }, {
      allowUnknown: true,
    }), next);

    request(server)
      .get('/')
      .set('accept', 'application/json')
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });

  test('req.params', async (done) => {
    const next = jest.fn();
    const server = Server();

    server.get('/params/:id', celebrate({
      [Segments.PARAMS]: {
        id: Joi.number().required(),
      },
    }), next);

    request(server)
      .get('/params/notanumber')
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });

  test('req.query', async (done) => {
    const next = jest.fn();
    const server = Server();

    server.get('/', celebrate({
      [Segments.QUERY]: Joi.object().keys({
        start: Joi.string().required(),
      }),
    }), next);

    request(server)
      .get('/')
      .query({ end: 'celebrate' })
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });

  test('req.cookies', async (done) => {
    const next = jest.fn();
    const server = Server();

    server.post('/', celebrate({
      cookies: {
        state: Joi.number().required(),
      },
    }), next);

    request(server)
      .post('/')
      .set('Cookie', 'state=notanumber')
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });

  test('req.signedCookies', async (done) => {
    const next = jest.fn();
    const server = Server();

    server.get('/', celebrate({
      [Segments.SIGNEDCOOKIES]: {
        secureState: Joi.number().required(),
      },
    }), next);

    const val = signature.sign('notanumber', 'secret');

    request(server)
      .get('/')
      .set('Cookie', `state=s:${val}`)
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });

  test('req.body', async (done) => {
    const next = jest.fn();
    const server = Server();

    server.post('/', celebrate({
      [Segments.BODY]: {
        first: Joi.string().required(),
        last: Joi.string(),
        role: Joi.number().integer(),
      },
    }), next);

    request(server)
      .post('/')
      .send({
        first: 'john',
        last: 123,
      })
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });
});

describe('update req values', () => {
  test('req.headers', async (done) => {
    const server = Server();

    server.get('/', celebrate({
      [Segments.HEADERS]: {
        accept: Joi.string().regex(/json/),
        'secret-header': Joi.string().default('@@@@@@'),
      },
    }, {
      allowUnknown: true,
    }), (req, res) => {
      delete req.headers.host; // this can change computer to computer, so just remove it
      const { headers } = req;

      expect(headers).toEqual({
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
        connection: 'close',
        'user-agent': 'node-superagent/3.8.3',
        'secret-header': '@@@@@@',
      });
      res.send(200);
    });

    request(server)
      .get('/')
      .set('accept', 'application/json')
      .expect(200)
      .end(done);
  });

  test('req.params', async (done) => {
    const server = Server();

    server.get('/user/:id', celebrate({
      [Segments.PARAMS]: {
        id: Joi.string().uppercase(),
      },
    }), (req, res) => {
      const { params } = req;
      expect(params.id).toBe('ADAM');
      res.send(200);
    });

    request(server)
      .get('/user/adam')
      .expect(200)
      .end(done);
  });

  test('req.query', async (done) => {
    const server = Server();

    server.get('/', celebrate({
      [Segments.QUERY]: Joi.object().keys({
        name: Joi.string().uppercase(),
        page: Joi.number().default(1),
      }),
    }), (req, res) => {
      const { query } = req;

      expect(query).toEqual({
        name: 'JOHN',
        page: 1,
      });

      res.send(200);
    });

    request(server)
      .get('/')
      .query({ name: 'john' })
      .expect(200)
      .end(done);
  });

  test('req.body', async (done) => {
    const server = Server();

    server.post('/', celebrate({
      [Segments.BODY]: {
        first: Joi.string().required(),
        last: Joi.string().default('Smith'),
        role: Joi.string().uppercase(),
      },
    }), (req, res) => {
      const { body } = req;
      expect(body).toEqual({
        first: 'john',
        role: 'ADMIN',
        last: 'Smith',
      });
      res.send(200);
    });

    request(server)
      .post('/')
      .send({
        first: 'john',
        role: 'admin',
      })
      .expect(200)
      .end(done);
  });
});

describe('reqContext', () => {
  test('passes req as Joi context during validation', async (done) => {
    const server = Server();

    server.post('/:userId', celebrate({
      [Segments.BODY]: {
        id: Joi.number().valid(Joi.ref('$params.userId')),
      },
      [Segments.PARAMS]: {
        userId: Joi.number().integer().required(),
      },
    }, null, {
      reqContext: true,
    }), (req, res) => {
      expect(req.body.id).toEqual(req.params.userId);
      res.send(200);
    });

    request(server)
      .post('/12345')
      .send({ id: 12345 })
      .expect(200, done);
  });

  test('fails validation based on req values', async (done) => {
    const server = Server();
    const next = jest.fn();

    server.post('/:userId', celebrate({
      [Segments.BODY]: {
        id: Joi.number().valid(Joi.ref('$params.userId')),
      },
      [Segments.PARAMS]: {
        userId: Joi.number().integer().required(),
      },
    }, null, {
      reqContext: true,
    }));

    request(server)
      .post('/123')
      .send({ id: 12345 })
      .expect(() => {
        expect(next).not.toHaveBeenCalled();
      })
      .expect(500, done);
  });
});

describe('multiple-runs', () => {
  test('continues to set default values', (done) => {
    const server = Server();

    server.get('/', celebrate({
      [Segments.HEADERS]: {
        accept: Joi.string().regex(/json/),
        'secret-header': Joi.string().default('@@@@@@'),
      },
    }, {
      allowUnknown: true,
    }), (req, res) => {
      delete req.headers.host;
      res.send(req.headers);
    });

    const expectedResponse = {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      connection: 'close',
      'user-agent': 'node-superagent/3.8.3',
      'secret-header': '@@@@@@',
    };

    async.series([
      function assertion(cb) { request(server).get('/').set('accept', 'application/json').expect(expectedResponse, cb); },
      function assertion(cb) { request(server).get('/').set('accept', 'application/json').expect(expectedResponse, cb); },
      function assertion(cb) { request(server).get('/').set('accept', 'application/json').expect(expectedResponse, cb); },
    ], done);
  });

  test('continues to validate values', (done) => {
    const server = Server();
    server.post('/', celebrate({
      [Segments.BODY]: {
        name: Joi.string().required(),
      },
    }), (req, res) => {
      res.send(200);
    });

    async.series([
      function assertion(cb) { request(server).post('/').send({ age: random.number() }).expect(500, cb); },
      function assertion(cb) { request(server).post('/').send({ name: 'ana' }).expect(200, cb); },
      function assertion(cb) { request(server).post('/').send({ age: random.number() }).expect(500, cb); },

    ], done);
  });
});
