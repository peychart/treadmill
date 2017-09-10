#!/usr/bin/env nodejs
var port	= process.env.NODE_PORT || 8080;
var hostname	= process.env.NODE_HOSTNAME || '0.0.0.0';
var app		= require('express')();
var io		= require('socket.io').listen(app.listen(port, hostname));
console.log( Date() + ': treadmill connected on ' + hostname + ":" + port + '...' );

////////////////////////////////////////////////////////////////////////////////
// Interface displaying:
app.get( '/', function(req, res) {
  console.log( Date() + ': connected to ' + req.url + '.' );
  res.sendFile( req.url, {root: require('path').join(__dirname, '/public' )} );
} );

app.get( '/public/*', function(req, res) {
  //console.log( Date() + ': connected to ' + req.url + '.' );
  res.sendFile( req.url, {root: __dirname} );
} );

app.use( function(req, res, next) {
  res.setHeader( 'Content-Type', 'text/plain' );
  res.status(404).send( 'Page not found!' );
} );
////////////////////////////////////////////////////////////////////////////////
// Wiring-PI code:
// see: https://github.com/WiringPi/WiringPi-Node/blob/master/DOCUMENTATION.md
var DUMMY = true;		// DUMMY=true for no motor connected...
				// SET DUMMY TO FALSE AT YOUR OWN RISK!!!
				// This program is distributed in the hope that
				// it will be useful, but WITHOUT ANY WARRANTY.
const powerPin		= 0;	// pin 11
const powerOffDelay	= 900000;
const motorPin		= 1;	// pin 12
const inhibCounterPin	= 2;	// pin 13
const resetCounterPin	= 3;	// pin 15
const speedMax		= 25;		// km/h
const deltaSpeed	= 2;		// km/h per second...
const formFactor	= 36*18;	// pulses per meter...
					// 1km/h->180p/s, 25km/h->4500p/s
const speedPeriod	= 500;		// ms
const deltaMax		= Math.round(deltaSpeed*speedPeriod/100)/10;
var currentSpeed	= 0;
var init		= false;
var setSpeedIntervalId	= 0;
var powerOffIntervalId	= 0;
var counterFD		= 0;
var exec		= require('child_process').exec;
var wpi; if(!DUMMY){wpi	= require('wiring-pi'); wpi.setup('wpi');}
var initIntervalId	= setInterval(function(){
	if(initHardware()){
		console.log(Date()+': Hardware connected...');
		init=true; clearInterval(initIntervalId);
	} shutdown();
}, 5000);

function initHardware(){
	if(!DUMMY){
		wpi.pinMode(powerPin, wpi.OUTPUT); wpi.pwmWrite(powerPin, 0);
		if(wpi.pinMode(motorPin, wpi.PWM_OUTPUT)<0)		return false;
		wpi.pwmWrite(motorPin, 0);
		if((counterFD=wpi.mcp23017Setup(100, 0x20))<0)		// pin 15:17 to ground
									return false;
		if(wiringPiI2CWriteReg8(counterFD, 0x0a, 0x80)<0)	// set 16 bits mode
									return false;
		if(wiringPiI2CWriteReg16(counterFD, 0x00, 0xffff)<0)	// set all pins as INPUT
									return false;
		if(wiringPiI2CWriteReg16(counterFD, 0x0c, 0xf000)<0)	// set pullup on disconnected
									return false;
       		setInterval(function(){
			wpi.pwmWrite(inhibCounterPin, 1);
			currentSpeed = 0x10ff & wiringPiI2CReadReg16(counterFD, 0x12);
               		currentSpeed = Math.round(v*3600/formFactor/100)/10;
			wpi.pwmWrite(resetCounterPin, 1); wpi.pwmWrite(resetCounterPin, 0);
			wpi.pwmWrite(inhibCounterPin, 0);
       		}, 1000);
	} return true;
}

function setSpeed(v){
	clearInterval(setSpeedIntervalId); v=(v<0?0:v); v=(v>speedMax?speedMax:v);
	setSpeedIntervalId=setInterval(function(){
		if(currentSpeed===v)
			clearInterval(setSpeedIntervalId);
		else{	if(v && init){
				var speed, delta=v-currentSpeed, sign=Math.sign(delta);
				delta*=sign; delta=sign*(delta > deltaMax ? deltaMax : delta);
				speed = Math.round((currentSpeed+delta)*10)/10;
				if(DUMMY)
					currentSpeed = speed;
				else	wpi.pwmWrite(motorPin, Math.round(speed*1024/speedMax));
			}else{	if(DUMMY)
					currentSpeed=0;
				else	wpi.pwmWrite(motorPin, 0);
		}	}
	}, speedPeriod);
}

function shutdown(delay=0){
	clearInterval(powerOffIntervalId);
	if(delay>=0){
	    powerOffIntervalId=setInterval(function(){
			console.log(Date()+': bye!');
			if(!DUMMY) {
				wpi.pwmWrite(powerPin, 1);
				exec("/sbin/shutdown -h now", function(){console.log('Shutdown -h now...');});
			}else	console.log('DUMMY mode: hardware reconnect...');
	    }, delay?delay:powerOffDelay);
}	}
////////////////////////////////////////////////////////////////////////////////
// Client/server communication :
var clientsId = [''];
var speedRefreshId;
function sendSpeed(sock, delay=0){
  if(delay)
	speedRefreshId=setInterval(function(){sock.emit('speed', currentSpeed);}, delay);
  else{	setSpeed(0); clearInterval(speedRefreshId);
}	}

io.sockets.on('connection', function(socket){
	var id;
	clientsId.push(socket.id);

	// on PowerOn:
	socket.on('powerOn', function(data){	// Un seul a la fois:
		if( clientsId[0] == '' ) {	// libre...
			clientsId.splice(clientsId.indexOf(socket.id), 1);
			clientsId[0] = socket.id;
			socket.emit('allowed');
			setSpeed(0); sendSpeed(socket, speedPeriod);
			id=setInterval(function(){
				if(init)
					clearInterval(id);
				else	socket.emit('initDefault');
			}, 5000);
			shutdown(-1);
		}else 	socket.emit('denied');	// deja occupe!
	});

	// on PowerOff:
	socket.on('powerOff', function(data){
		sendSpeed(socket, 0); clientsId.unshift('');
		clearInterval(id);
		shutdown();
	});

	// Speed management:
	socket.on('speed', function(data){if(clientsId[0] == socket.id){
		setSpeed(data);
	}});

	// on Pause:
	socket.on('pause', function(data){if(clientsId[0] == socket.id){
		setSpeed(0);
	}});

	// On disconnect:
	socket.on('disconnect', function(){
		if(clientsId[0] == socket.id) {
			sendSpeed(socket, 0);
			clientsId.unshift('');
			shutdown();
		} clientsId.splice(clientsId.indexOf(socket.id), 1);
	});
});
////////////////////////////////////////////////////////////////////////////////
