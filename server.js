import http from 'node:http';
import {createHandler} from './lib/app.js';
const server=http.createServer(createHandler());
server.listen(Number(process.env.PORT||3000),()=>console.log('Jefas server ready'));
