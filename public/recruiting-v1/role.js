// 头像点击展开角色菜单，点别处收起
(function(){
  document.addEventListener('click',function(e){
    var r=e.target.closest('.role');
    document.querySelectorAll('.role.open').forEach(function(x){ if(x!==r) x.classList.remove('open'); });
    if(r && !e.target.closest('.dd a')) r.classList.toggle('open');
  });
  // 保证菜单里 5 个角色齐全
  var ROLES=[['ta.html','以TA身份'],['manager.html','以用人经理身份'],['interviewer.html','以面试官身份'],['approver.html','以审批人身份'],['hrbp.html','以HRBP身份']];
  document.querySelectorAll('.role .dd').forEach(function(dd){
    var cur=dd.querySelector('a.on'); var on=cur?cur.getAttribute('href'):'';
    dd.innerHTML='<div class="muted">切换身份</div>'+ROLES.map(function(r){return '<a href="'+r[0]+'"'+(r[0]===on?' class="on"':'')+'>'+r[1]+'</a>'}).join('');
  });
})();
// v0.8 招聘助手默认收起成一条；.chat[data-open] 表示有异常/需判断，默认展开
(function(){
  var c=document.querySelector('.chat'); if(!c) return;
  var last=c.dataset.last; if(!last){var r=c.querySelector('.rec2,.m.ai');last=r?r.textContent.replace(/\s+/g,' ').trim():'';}
  if(last.length>34) last=last.slice(0,34)+'…';
  var bar=document.createElement('div'); bar.className='abar'+(c.dataset.open?' alert':'');
  bar.innerHTML='<b>💬 招聘助手</b>'+last+'　▴';
  var h=c.querySelector('.ch'); if(h){var m=document.createElement('span');m.className='chmin';m.textContent='收起 ▾';h.insertBefore(m,h.firstChild);m.onclick=function(){set(true)};}
  function set(min){document.body.classList.toggle('asst-min',min);bar.style.display=min?'':'none';}
  bar.onclick=function(){set(false)}; document.body.appendChild(bar);
  set(!c.dataset.open);
})();
