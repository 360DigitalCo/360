const demo =
document.getElementById("chatDemo");


const messages =
document.querySelectorAll(".demo-message");


const typing =
document.querySelector(".typing");


let running=false;


function sleep(ms){
return new Promise(resolve=>setTimeout(resolve,ms));
}



async function typeMessage(element){

const text =
element.dataset.text;


element.textContent="";


typing.style.display="block";


await sleep(700);


typing.style.display="none";


for(const char of text){

element.textContent += char;

await sleep(
35 + Math.random()*70
);

}


}



async function runDemo(){

if(running)
return;


running=true;


for(const message of messages){

message.classList.add("visible");

await typeMessage(message);

await sleep(500);

}


running=false;

}



function resetDemo(){

messages.forEach(message=>{

message.textContent="";

message.classList.remove("visible");

});


typing.style.display="none";


running=false;

}



const observer =
new IntersectionObserver(entries=>{


entries.forEach(entry=>{


if(entry.isIntersecting){

runDemo();

}else{

resetDemo();

}


});


},{
threshold:.55
});



observer.observe(demo);





document
.querySelectorAll(".ripple-btn")
.forEach(button=>{


button.onclick=e=>{


const ripple =
document.createElement("span");


ripple.className="ripple";


const size =
Math.max(
button.offsetWidth,
button.offsetHeight
);



ripple.style.width=size+"px";

ripple.style.height=size+"px";


ripple.style.left =
e.offsetX-size/2+"px";


ripple.style.top =
e.offsetY-size/2+"px";


button.appendChild(ripple);


setTimeout(()=>{
ripple.remove()
},700);


};


});





document
.getElementById("theme")
.onclick=()=>{

document.body.classList.toggle("dark");

};
