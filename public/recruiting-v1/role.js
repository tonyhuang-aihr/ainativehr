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
