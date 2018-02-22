#!/usr/bin/env nodejs
var port	= process.env.NODE_PORT || 8080;
var hostname	= process.env.NODE_HOSTNAME || '0.0.0.0';
var app		= require('express')();
var io		= require('socket.io').listen(app.listen(port, hostname));
var fs		= require('fs');
console.log(Date() + ': treadmill connected on ' + hostname + ":" + port + '...');

////////////////////////////////////////////////////////////////////////////////
// Interface displaying:
app.get('/', function(req, res) {
  console.log(Date() + ': connected to ' + req.url + '.');
  res.sendFile(req.url, {root: require('path').join(__dirname, '/public')});
});

// Push the training programs to the client:
app.get('/public/assets/programs.json', function(req, res) {
  fs.readFile(require('path').join(__dirname, '/public/assets/programs.json'), function(err, data){
    res.writeHead(200, {'Content-Type': 'text/html'});
    if(!err) res.write(data);
    res.end();
  });
});

app.get('/public/*', function(req, res) {
  //console.log(Date() + ': connected to ' + req.url + '.');
  res.sendFile(req.url, {root: __dirname});
});

app.use(function(req, res, next) {
  res.setHeader('Content-Type', 'text/plain');
  res.status(404).send('Page not found!');
});
////////////////////////////////////////////////////////////////////////////////
// Wiring-PI code:
// see: https://github.com/WiringPi/WiringPi-Node/blob/master/DOCUMENTATION.md
var DUMMY = false;		// DUMMY=true for no motor connected...
				// SET DUMMY TO FALSE AT YOUR OWN RISK!!!
				// This program is distributed in the hope that
				// it will be useful, but WITHOUT ANY WARRANTY.
const powerPin		= 23;	// pin 33 (GPIO13)-(relay~1mn)
const powerOffDelay	= 600000;
const motorPin		= 1;	// pin 12 (GPIO18)
const freezeCounterPin	= 0;	// pin 11 (GPIO17)
const resetCounterPin	= 2;	// pin 13 (GPIO27)
const speedMax		= 25;		// km/h
//const deltaSpeed	= 5;		// km/h per second...
const deltaSpeed	= 50;		// Pendant la durée des tests !!!!!!!!!!!!!!!!!!
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
var powerOn		= setInterval(function(){
	resetShutdown();
	if( (init=initHardware()) ){
		console.log(Date()+': Hardware connected...');
		clearInterval(powerOn); powerOn=true;
	}
}, 5000);

function initHardware(){
 if(!DUMMY){
	if(wpi.pinMode(powerPin, wpi.OUTPUT)<0
		|| wpi.pinMode(motorPin, wpi.PWM_OUTPUT)<0)	return false;
	if(wpi.pinMode(resetCounterPin,, wpi.OUTPUT)<0)		return false;
	if(wpi.pinMode(freezeCounterPin, wpi.OUTPUT)<0)		return false;
	wpi.pwmSetMode(wpi.PWM_MODE_MS); wpi.pwmSetRange(1024); wpi.pwmSetClock(16); // 19.2e6/1024/16=1.2kHz
	wpi.pwmWrite(motorPin, 0); wpi.digitalWrite(powerPin, 0);

	// MCP23017 setup:
	if((counterFD=wpi.wiringPiI2CSetup(0x20))<0)		// pin 15:17 to ground=0x20
								return false;
	if(wpi.wiringPiI2CWriteReg8(counterFD, 0x05, 0x00)<0
	  || wpi.wiringPiI2CWriteReg8(counterFD, 0x0a, 0x20)<0){// set 16 bits mode
						wiringPiI2CClose(counterFD);
								return false;}
	if(wpi.wiringPiI2CWriteReg16(counterFD, 0x00, 0xffff)<0){// set all pins as INPUT
						wiringPiI2CClose(counterFD);
								return false;}
	if(wpi.wiringPiI2CWriteReg16(counterFD, 0x0c, 0xf000)<0	// set pullup on 4 disconnected HSBits
	|| wpi.wiringPiI2CWriteReg16(counterFD, 0x02, 0xf000)<0){// and convert them to 0
						wiringPiI2CClose(counterFD);
								return false;}
	getSpeed();
 } return true;
}

function getSpeed(period=10){
	if(powerOn) wpi.digitalWrite(powerPin, 1);
	setTimeout(function(){wpi.digitalWrite(powerPin, 0);}, 1<<period>>1);

	wpi.digitalWrite(freezeCounterPin, 1);
	var count= /*0x0fff & */wpi.wiringPiI2CReadReg16(counterFD, 0x12); // pulses/meters/(1<<period)ms
	wpi.digitalWrite(resetCounterPin, 1);
	wpi.digitalWrite(freezeCounterPin, 0);
	wpi.digitalWrite(resetCounterPin, 0);
	//				->m		/s	    /h	 -xx.y-	== km/h
	//currentSpeed = Math.round(count/formFactor /(1<<period) *3600 *10)/10;
	currentSpeed = ((count*36000/formFactor+500)>>period)/10;

	// Ajust period of the speed measurement to prevent overflow of the counter (12bits):
	if(count>(1<<15)/10 && periode>8)	// more than 80% of (1<<12) -> periode/2
		period--;
	else if(period<10 && count<(1<<13)/10)	// less than 20% of (1<<12) -> periode*2
		period++;
	setTimeout(function(){getSpeed(period);}, 1<<period);
}

function setSpeed(v, sock=0){
	clearInterval(setSpeedIntervalId); v=(v<0?0:v); v=(v>speedMax?speedMax:v);
	setSpeedIntervalId=setInterval(function(){
		if(currentSpeed===v){
			if(setSpeedIntervalId._idleTimeout != -1){
				clearInterval(setSpeedIntervalId);
				if (!v && !DUMMY) wpi.pwmWrite(motorPin, 0);
			}
		}else{	if(/*v && */init){
				var speed, delta=v-currentSpeed, sign=Math.sign(delta);
				delta*=sign; delta=sign*(delta > deltaMax ? deltaMax : delta);
				//speed = Math.round((currentSpeed+delta)*10)/10;
				speed = currentSpeed+delta;
				if(!DUMMY){
					wpi.pwmWrite(motorPin, Math.round(speed*1024/speedMax));
//console.log(Math.round(speed*1024/speedMax));
				}else	currentSpeed = speed;
			}else{	if(!DUMMY)
					wpi.pwmWrite(motorPin, 0);
				else	currentSpeed=0;
		}	}
		if(sock) sock.emit('speed', currentSpeed);
//console.log('CurrentSpeed: '+currentSpeed);
	}, speedPeriod);
}

function resetShutdown(delay=0){
	clearInterval(powerOffIntervalId);
	if(delay>=0){
		powerOffIntervalId=setInterval(function(){
			console.log(Date()+': bye!');
			if(!DUMMY) {
				powerOn=false;	// Power off-1 mn...
				exec("/sbin/shutdown -h now", function(){console.log('Shutdown -h now...');});
			}else	console.log('DUMMY mode: hardware reconnect...');
		}, delay?delay:powerOffDelay);
}	}
////////////////////////////////////////////////////////////////////////////////
// Client/server communication :
var clientsId = [''];
/*var speedRefreshId;
function sendSpeed(sock, delay=0){
	if(delay)
		speedRefreshId=setInterval(function(){sock.emit('speed', currentSpeed);}, delay);
	else{	setSpeed(0); clearInterval(speedRefreshId);
}	}*/

io.sockets.on('connection', function(socket){
	var id;
	clientsId.push(socket.id);

	// On PowerOn:
	socket.on('powerOn', function(data){	// Un seul a la fois:
		if(clientsId[0] == '') {	// libre...
			clientsId.splice(clientsId.indexOf(socket.id), 1);
			clientsId[0] = socket.id;
			setSpeed(0, socket); /*sendSpeed(socket, speedPeriod);*/
			id=setInterval(function(){
				if(init)
					clearInterval(id);
				else	socket.emit('initFault');
			}, 5000);
			resetShutdown(-1);
		}else 	socket.emit('denied');	// deja occupe!
	});

	// On PowerOff:
	socket.on('powerOff', function(data){if(clientsId[0] == socket.id){
		setSpeed(0); clientsId.unshift('');
		clearInterval(id);
		resetShutdown(30000);
	}});

	// Speed management:
	socket.on('speed', function(data){if(clientsId[0] == socket.id){
		setSpeed(data, socket);
	}});

	// On Pause:
	socket.on('pause', function(data){if(clientsId[0] == socket.id){
		setSpeed(0, socket);
	}});

	// On save program:
	socket.on('savProg', function(data){if(clientsId[0] == socket.id){
		fs.readFile(require('path').join(__dirname, '/public/assets/programs.json'), function(err, d){
			if(!err || err.code==='ENOENT') try{
				var o=[], b=JSON.parse(data);
				if(!err) o=JSON.parse(d);
				o[parseInt(Object.keys(b))]=b[Object.keys(b)];
				writePrograms(o);
			}catch(er){throw er;}
			else throw(err);
	});	}});

	// On delete program:
	socket.on('delProg', function(data){if(clientsId[0] == socket.id){
		fs.readFile(require('path').join(__dirname, '/public/assets/programs.json'), function(err, d){
			if(err) throw err;
			try{	var o=JSON.parse(d); o.splice(parseInt(data),1);
				writePrograms(o);
			}catch(er){throw er;}
	});	}});

	// On disconnect:
	socket.on('disconnect', function(){
		if(clientsId[0] == socket.id){
			setSpeed(0);
			clientsId.unshift('');
			resetShutdown();
		} clientsId.splice(clientsId.indexOf(socket.id), 1);
});	});

function writePrograms(o){
	if(o) fs.writeFile(require('path').join(__dirname, '/public/assets/programs.json'), JSON.stringify(o), function(err){
		if(err) throw err;
	});
}
////////////////////////////////////////////////////////////////////////////////
