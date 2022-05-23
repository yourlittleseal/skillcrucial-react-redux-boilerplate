import express from 'express'
import path from 'path'
import cors from 'cors'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'
import axios from 'axios'

import cookieParser from 'cookie-parser'
import config from './config'
import Html from '../client/html'

require('colors')

let Root
try {
  // eslint-disable-next-line import/no-unresolved
  Root = require('../dist/assets/js/ssr/root.bundle').default
} catch {
  console.log('SSR not found. Please run "yarn run build:ssr"'.red)
}

let connections = []

const port = process.env.PORT || 8090
const server = express()

const setHeaders = (req, res, next) => {
  res.set('x-skillcrucial-user', '0b6dd76e-2d87-471c-ab58-147473ddb563')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  express.json({ limit: '50mb', extended: true }),
  cookieParser(),
  setHeaders
]

middleware.forEach((it) => server.use(it))

const { readFile, writeFile, unlink } = require('fs').promises

const getData = (url) => {
  const usersList = axios(url)
    .then(({ data }) => {
      return data
    })
    .catch((err) => {
      console.log(err)
      return []
    })
  return usersList
}

const writeNewFile = (array) => {
  return writeFile(`${__dirname}/users.json`, JSON.stringify(array), { encoding: 'utf8' })
}

//  const check = async() => {
//   return stat(`${__dirname}/users.json`)
//   .then(data => read(data))
// }

server.get('/api/v1/users/', async (req, res) => {
  const usersFile = await readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then((usersData) => {
      return JSON.parse(usersData)
    })
    .catch(async (err) => {
      console.log(err)
      const recievedData = await getData('https://jsonplaceholder.typicode.com/users')
      await writeNewFile(recievedData)
      return recievedData
    })
  res.json(usersFile)
})

server.post('/api/v1/users', async (req, res) => {
  const usersList = await readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then(async (usersStr) => {
      const parsedStr = JSON.parse(usersStr)
      const lastId = parsedStr[parsedStr.length - 1].id + 1
      await writeNewFile([...parsedStr, { ...req.body, id: lastId }])
      res.json({ status: 'success', id: lastId })
    })
    .catch(async (err) => {
      console.log(err)
      await writeNewFile([{ ...req.body, id: 1 }])
      res.json({ status: 'success', id: 1 })
    })
  res.json(usersList)
})

server.delete('/api/v1/users/:userId', async (req, res) => {
  const response = await readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then(async (str) => {
      const parsedStr = JSON.parse(str)
      const filterdUsers = parsedStr.filter((user) => {
        return +req.params.userId !== user.id
      })
      await writeNewFile(filterdUsers)
      return { status: 'success', id: +req.params.userId }
    })
    .catch(() => {
      return { status: 'no file exist', id: +req.params.userId }
    })
  res.json(response)
})

server.patch('/api/v1/users/:userId', async (req, res) => {
  const { userId } = req.params
  const updatedUser = { ...req.body, id: +userId }
  const response = await readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then(async (str) => {
      const parsedStr = JSON.parse(str)
      const updatedList = parsedStr.map((obj) => {
        return obj.id === +userId ? { ...obj, ...updatedUser } : obj
      })
      await writeNewFile(updatedList)
      return { status: 'success', id: +userId }
    })
    .catch(() => {
      return { status: 'no file exist', id: +userId }
    })
  res.json(response)
})

server.delete('/api/v1/users/', (req, res) => {
  unlink(`${__dirname}/users.json`)
  res.json({ status: 'File deleted' })
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

const app = server.listen(port)

if (config.isSocketsEnabled) {
  const echo = sockjs.createServer()
  echo.on('connection', (conn) => {
    connections.push(conn)
    conn.on('data', async () => {})

    conn.on('close', () => {
      connections = connections.filter((c) => c.readyState !== 3)
    })
  })
  echo.installHandlers(app, { prefix: '/ws' })
}
console.log(`Serving at http://localhost:${port}`)
