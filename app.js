import express from 'express';
import Node from './libs/Node';

const SocketIO = require('socket.io');
const app = express();
const server = app.listen(3000, ()=>{
  console.log('Server dang hoat dong nhe!!!! port : 3000');
});
// const server = require('http').createServer(app);

// const server = http.createServer();
const io = new SocketIO(server);
io.on('connection',(socket)=>{
  console.log('Co nguoi ket noi !!');
  socket.on('disconnect',()=>{
    console.log('Co nguoi thoat!'+socket.id);
  })
});
const node = new Node(io);
process.on('message', function(msg) {
  if (msg == 'shutdown') {
    console.log('Stop know stats server!');
    node.stop();
  }
});
