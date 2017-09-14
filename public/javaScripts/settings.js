function clearStopMode(){
	resetStopMode(); document.getElementById("canvasLcdChrono").style.display='none';
}function resetStopMode(){
	clearInterval(this.flashDisplayIntervalId);
	clearInterval(this.refreshDownCounterIntervalId);
	document.getElementById('comboTime').style.display='none';
	document.getElementById('comboTime').options.selectedIndex=0;
	document.getElementById('comboDistance').style.display='none';
	document.getElementById('comboDistance').options.selectedIndex=0;
	document.getElementById('comboStopMode').style.display='none';
	document.getElementById('comboStopMode').options.selectedIndex=0;
}

function openComboStopMode(){
	if(!isPowerOff(true)){ shutdown();
		if(isPauseOff() && speedThreshold()) clickPause();
		if(isSpeedGraph()) openSpeedGraph();
		else{	resetStopMode(); 
			flashDisplay(document.getElementById('comboStopMode'));
}	}	}

function setStopMode(el){
	clearInterval(this.flashDisplayIntervalId); el.style.display='none';
	switch(el.options.selectedIndex){
	    case 1: flashDisplay(document.getElementById('comboTime'));	break;
	    case 2: flashDisplay(document.getElementById('comboDistance')); break;
	    case 3: openSpeedGraph(); break;
	} el.options.selectedIndex=0;
}

function closeCombos(el){
	el.style.display='none';
	clearInterval(this.flashDisplayIntervalId);
	if(el.value!==0) {
		if(!speedThreshold()) isSpeedUp(true);
		downCounter(el.value, (el.id==='comboTime'? 's': 'm'));
}	}

function residual(v, s){
	const WIDTH=32;
	switch(s){
	    case 'm':
		v =Math.round(v-speedo.getOdoValue());
		s ='Distance restante: '+v+s;
		break;
	    case 's':
		v-=getChronoMeasuredTime();
		s ='Temps restant: '+(v<60? '': Math.trunc(v/60)+'mn:')+('0'+(v%60)).slice(-2)+s;
		break;
	    default: const DELAY=(v.length>1? 300: 150);
		var vv=v, t=getChronoMeasuredTime(), i=Math.trunc(t/DELAY), v=vv.length*DELAY-t;
		var r=1; while(vv[i+r] && vv[i+r]===vv[i]) r++; s=vv[i+r]||0; r=v-(vv.length-i-r)*DELAY;
		if(!(v%DELAY) && i)
			document.getElementById('speedGraph').firstChild.childNodes[i-1].getElementsByTagName('td')[0].className='speedprev bar';
		if(speedThreshold()!=vv[i] && isPauseOff())
			{speedThreshold(vv[i]+0.5); if(isPauseOff()) clickSpeed(document.getElementById('down'));}
		s=(v<60? '': Math.trunc(v/60)+'mn:')+('0'+(v%60)).slice(-2)+'s (dans '+(r<60? r+'s: ':Math.trunc(r/60)+'mn: ')+(s? s+'km/h)': 'pause)');
	} s +=' '.repeat((WIDTH-s.length)/2);
	lcd.setValue(s);
	return v;
}

function downCounter(duree, type=0){
	clearInterval(this.refreshDownCounterIntervalId);
	document.getElementById('canvasLcdChrono').style.display='none';
	this.flashDisplayIntervalId=setTimeout(function(){document.getElementById("canvasLcdChrono").style.display='block';}, 1000);
	this.refreshDownCounterIntervalId=setInterval(function(){
		if(residual(duree, type)<=0){
			deleteSpeedGraph();
			if(speedThreshold()<10){
				clearInterval(this.refreshDownCounterIntervalId);
				clearStopMode(); clickPause();
			}else{	// Yet 5km/h during 5mn:
				chronoReset(); downCounter([5]);
		}	}
	}, 1000);
}

function openSpeedGraph(){
	document.getElementById('interface').style.display='none';
	document.getElementById('speedBarGraphs').style.display='block';
	if(isPauseOff()) clickPause();
	if(!isSpeedGraph())
		loadSpeedGraph(document.getElementsByName('prog')[0]);
}

function getSpeedGraphValues(){ var v=[];
	for(var el=document.getElementById('speedGraph').firstChild.firstChild; el; el=el.nextSibling)
		v.push(parseInt(el.getElementsByTagName('td')[0].firstChild.innerHTML)||'0');
	for(var i=v.length; i && !v[--i];) v.pop();
	return v;
}

function closeSpeedGraph(){
	isSpeedGraphModified();
	document.getElementById('speedBarGraphs').style.display='none';
	document.getElementById('interface').style.display='block';
	downCounter(getSpeedGraphValues());
}

function setBarValue(el, incr=0){ shutdown();
	el=(incr>0? el: el.parentElement.getElementsByTagName('td')[0]);
	resetSpeedGraphButtons(false);
	if(el.className=='speed bar'){
		var v=parseInt(el.firstChild.innerHTML||'0');
		switch(v){
			case 25: if(incr>0)	break;
			case  0: if(incr<0){v=1;break;}
			default: v+=incr;
		} el.firstChild.innerHTML=(v? v: '');
		el.style.height=(v*12)+'px';
}	}

function isSpeedGraph(){return(document.getElementById('speedGraph').firstChild!=null);}

function deleteSpeedGraph(){
	for(var table=document.getElementById('speedGraph'); table.lastChild;)
		table.removeChild(table.lastChild);
}

function initSpeedGraph(v=[5,8,12,15,20,15,12,10,10,10,8,5]){
	deleteSpeedGraph();
	var j=Math.trunc(getChronoMeasuredTime()/5/60);
	var tbody=document.createElement('tbody');
	for (var i=0; i<12; i++){
		var tr=document.createElement('tr');
		var th=document.createElement('th');
		var td=document.createElement('td');
		var p=document.createElement('p');
		p.innerHTML=(v[i]? v[i]: ''); td.appendChild(p);

		if(i<j) td.className='speedprev bar';
		else	td.className='speed bar';
		td.style.height=(v[i]*12)+'px';
		td.onclick=function(){setBarValue(this,1);};
		th.scope='row'; th.innerHTML=((i+1)*5)+'mn';
		th.onclick=function(){setBarValue(this,-1);};

		tr.appendChild(th); tr.appendChild(td);
		tr.id='q'+i; tbody.appendChild(tr);
	} document.getElementById('speedGraph').appendChild(tbody);
}

function resetSpeedGraphButtons(b=true){
	document.getElementById('save').hidden=b;
	document.getElementById('add').hidden=!b;
	document.getElementById('reset').hidden=b;
	document.getElementById('del').hidden=!b;
}

function addProgram(e=false){
	var r=document.createElement('INPUT');
	if(!e) e=document.getElementsByName('prog');
	var i=e.length; e=e[0].parentElement;
	r.type='radio'; r.name='prog'; r.value=i.toString();
	r.onmousedown=function(){isSpeedGraphModified();loadSpeedGraph(this);};
	e.appendChild(r); e.appendChild(document.createTextNode('P'+(i+1)));
	e.appendChild(document.createElement('br'));
	return r;
}

function displayProgRadioSelector(n, exc=-1){
	var e=document.getElementsByName('prog')[0].parentElement;
	while(e.length>1) e.removeChild(e.lastChild);
	for(var i=1; i<n; i++) if(i!=exc) addProgram(e);
	e.firstChild.checked=true;
}

function loadSpeedGraph(e=false){
	if(!e)	e=document.querySelector('input[name="prog"]:checked');
	e.checked=true;
	resetSpeedGraphButtons();
	if(e.value==0) document.getElementById('del').hidden=true;
	var xhttp=new XMLHttpRequest();
	xhttp.onreadystatechange=function(){ var o;
		if (this.readyState==4 && this.status==200)
		try{	try{o=JSON.parse(this.responseText);}catch(e){o=false;};
			if(!o)	saveSpeedGraph(e);
			else if(o.length!==document.getElementsByName('prog').length)
				displayProgRadioSelector(o.length);
			initSpeedGraph(o[e.value]);
		}catch(er){initSpeedGraph(); saveSpeedGraph(e);}
	}; xhttp.open("GET", "/public/assets/programs.json", true); xhttp.send();
}

function isSpeedGraphModified(){
	if(!document.getElementById('save').hidden
	    && confirm('Voulez-vous sauvegarder vos modifications ?'))
		saveSpeedGraph(document.querySelector('input[name="prog"]:checked'));
	else	resetSpeedGraphButtons();
}

function saveSpeedGraph(e=false){
	resetSpeedGraphButtons();
	if(!e)	e=document.querySelector('input[name="prog"]:checked');
	sock.emit('savProg', '{"'+e.value+'": ['+getSpeedGraphValues()+']}');
}

function addSpeedGraph(){
	isSpeedGraphModified();
	if(confirm('Voulez-vous créer un nouveau programme ?')){
		var e=addProgram(); e.checked=true; initSpeedGraph();
		saveSpeedGraph(e);
}	}

function removeSpeedGraph(){
	if(document.getElementsByName('prog').length>1){
		document.getElementById('del').disable=false;
		var e=document.querySelector('input[name="prog"]:checked');
		if(confirm('Voulez-vous vraiment supprimer ce programme ?')==true){
			var i=(e.value? e.value-1: e.value);
			displayProgRadioSelector(e.parentElement.length,e.value);
			sock.emit('delProg', e.value);
			e=document.getElementsByName('prog')[i];
			e.checked=true; loadSpeedGraph(e);
		}
	}else{	resetSpeedGraphButtons();
}	}
