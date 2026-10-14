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
/* v0.8.2 转发到群讨论：先弹确认卡 */
(function(){var D={demand:{t:'高级 HRIS · 需求',m:'王磊（用人经理）、陈静（招聘负责人）、周晓（HRBP）、招聘助手',c:['需求卡 v2 必须项 / 加分项','在面人选进展（3 人，仅姓名和阶段）','本次对话摘要'],x:'候选人薪资期望、联系方式'},'zhaomin-level':{t:'赵敏 · 定级讨论',m:'王磊（用人经理）、陈静（招聘负责人）、周晓（HRBP）、招聘助手',c:['赵敏时间线（一面 → 终面 → 当前）','王磊 P7、刘总 P8 的关键问答','需求卡定级 P7、P8 需确认编制'],x:'薪酬（期望薪资、录用通知方案、团队分位）'}};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a.fwd');if(!a)return;e.preventDefault();var k=new URL(a.href).searchParams.get('topic')||'demand',o=D[k]||D.demand;var w=document.createElement('div');w.className='fwdm';w.innerHTML='<div class="fwdc"><div class="fwdh">转发到飞书群 · '+o.t+'</div><div class="lb">拉谁进群</div>'+o.m+'<div class="lb">转发哪些内容</div><ul>'+o.c.map(function(x){return '<li>'+x+'</li>'}).join('')+'</ul><div class="fwdx">已按群成员权限去掉：'+o.x+'<span class="muted">（按群里权限最低的人过滤：王磊看不到薪酬）</span></div><div class="fwdf"><span class="btn" data-x>取消</span><span class="btn p" data-ok>确认并进群</span></div></div>';document.body.appendChild(w);w.onclick=function(ev){if(ev.target===w||ev.target.hasAttribute('data-x'))w.remove();if(ev.target.hasAttribute('data-ok'))location.href=a.href}},true)})();
