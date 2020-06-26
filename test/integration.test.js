/* eslint-env jest */
const restify = require('restify');
const request = require('supertest');
const signature = require('cookie-signature');
const cookieParser = require('cookie-parser');

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

describe.skip('update req values', () => {
  test('req.headers', async () => {
    expect.assertions(1);
    const server = Server();
    const team = new Teamwork();

    server.get('/', celebrate({
      [Segments.HEADERS]: {
        accept: Joi.string().regex(/json/),
        'secret-header': Joi.string().default('@@@@@@'),
      },
    }, {
      allowUnknown: true,
    }), (req) => {
      delete req.headers.host; // this can change computer to computer, so just remove it
      team.attend(req);
    });

    server.inject({
      method: 'GET',
      url: '/',
      [Segments.HEADERS]: {
        accept: 'application/json',
      },
    });

    const { headers } = await team.work;

    expect(headers).toEqual({
      accept: 'application/json',
      'user-agent': 'shot',
      'secret-header': '@@@@@@',
    });
  });

  test('req.params', async () => {
    expect.assertions(1);
    const server = Server();
    const team = new Teamwork();

    server.get('/user/:id', celebrate({
      [Segments.PARAMS]: {
        id: Joi.string().uppercase(),
      },
    }), team.attend.bind(team));

    server.inject({
      method: 'get',
      url: '/user/adam',
    });

    const { params } = await team.work;

    expect(params.id).toBe('ADAM');
  });

  test('req.query', async () => {
    expect.assertions(1);
    const server = Server();
    const team = new Teamwork();

    server.get('/', celebrate({
      [Segments.QUERY]: Joi.object().keys({
        name: Joi.string().uppercase(),
        page: Joi.number().default(1),
      }),
    }), team.attend.bind(team));

    server.inject({
      url: '/?name=john',
    });

    const { query } = await team.work;

    expect(query).toEqual({
      name: 'JOHN',
      page: 1,
    });
  });

  test('req.body', async () => {
    expect.assertions(1);
    const server = Server();
    const team = new Teamwork();

    server.post('/', celebrate({
      [Segments.BODY]: {
        first: Joi.string().required(),
        last: Joi.string().default('Smith'),
        role: Joi.string().uppercase(),
      },
    }), team.attend.bind(team));

    server.inject({
      url: '/',
      method: 'post',
      payload: {
        first: 'john',
        role: 'admin',
      },
    });

    const { body } = await team.work;
    expect(body).toEqual({
      first: 'john',
      role: 'ADMIN',
      last: 'Smith',
    });
  });
});

describe.skip('reqContext', () => {
  test('passes req as Joi context during validation', async () => {
    expect.assertions(2);
    const server = Server();
    const team = new Teamwork({ meetings: 2 });

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
      team.attend(req);
      res.send();
    });

    server.inject({
      method: 'POST',
      url: '/12345',
      payload: {
        id: 12345,
      },
    }, team.attend.bind(team));

    const [req, res] = await team.work;
    expect(req.body.id).toEqual(req.params.userId);
    expect(res.statusCode).toBe(200);
  });

  test('fails validation based on req values', async () => {
    expect.assertions(2);
    const server = Server();
    const team = new Teamwork();
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
    }), next);

    server.inject({
      method: 'POST',
      url: '/123',
      payload: {
        id: 12345,
      },
    }, team.attend.bind(team));

    const res = await team.work;

    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe.skip('multiple-runs', () => {
  test('continues to set default values', () => {
    expect.assertions(10);
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
      res.send(req.headers);
    });

    const attempts = Array.from({ length: 10 }, () => new Promise((resolve) => server.inject({
      method: 'GET',
      url: '/',
      headers: {
        accept: 'application/json',
      },
    }, (r) => {
      resolve(JSON.parse(r.payload));
    })));

    return Promise.all(attempts).then((v) => {
      v.forEach((headers) => {
        expect(headers).toEqual({
          accept: 'application/json',
          'user-agent': 'shot',
          'secret-header': '@@@@@@',
        });
      });
    });
  });

  test('continues to validate values', () => {
    expect.assertions(10);
    const server = Server();

    server.post('/', celebrate({
      [Segments.BODY]: {
        name: Joi.string().required(),
      },
    }));

    const attempts = Array.from({ length: 10 }, () => new Promise((resolve) => server.inject({
      method: 'POST',
      url: '/',
      payload: {
        age: random.number(),
      },
      headers: {
        accept: 'application/json',
      },
    }, (r) => {
      resolve(r.statusCode);
    })));

    return Promise.all(attempts).then((v) => {
      v.forEach((statusCode) => {
        expect(statusCode).toEqual(500);
      });
    });
  });
});
