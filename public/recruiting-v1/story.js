// 故事线演示层：URL 带 ?story=1&step=N(1-8) 时显示顶部进度条，可关
(function(){
  var S=[null,
   ['demand.html','用人经理','王磊','编制获批，和 Agent 对话澄清需求，确认需求卡'],
   ['ta.html','TA','陈静','审核 Agent Sourcing 结果，赵敏进入人选'],
   ['pipeline.html','TA','陈静','简历评估：推进赵敏到面试'],
   ['profile.html?role=interviewer','面试官','王磊','赵敏一面：采纳 Agent 评论，提交面评'],
   ['decision.html','TA','陈静','录用决策：Agent 查轮次与分歧，HRBP 周晓旁听'],
   ['approver-offer.html','审批人','沈蔚（HRBP Leader）','审批赵敏 Offer（薪酬仅审批链可见）'],
   ['feishu-card.html','TA','陈静','背调：第三方派单，结果回写画像（飞书通知）'],
   ['pipeline.html','HR','—','入职：需求完成，OD 编制回写']];
  var q=new URLSearchParams(location.search), n=parseInt(q.get('step'));
  if(q.get('story')!=='1'||!(n>=1&&n<=8)) return;
  function url(k){var u=S[k][0];return u+(u.indexOf('?')>-1?'&':'?')+'story=1&step='+k;}
  // 页内相对链接保持故事线参数
  var s=S[n], b=document.createElement('div');
  b.className='storybar';
  b.innerHTML='<b>故事线</b><span class="sp">第 '+n+'/8 步 · '+s[1]+' '+s[2]+' · '+s[3]+'</span>'+
    '<span class="pg">'+[1,2,3,4,5,6,7,8].map(function(i){return '<i class="'+(i<=n?'on':'')+'"></i>'}).join('')+'</span>'+
    (n>1?'<a href="'+url(n-1)+'">← 上一步</a>':'<a class="dis">← 上一步</a>')+
    (n<8?'<a class="nx" href="'+url(n+1)+'">下一步 →</a>':'<a class="nx" href="index.html">回到总入口</a>')+
    '<a class="x" href="'+(function(){q.delete('story');q.delete('step');var t=q.toString();return location.pathname.split('/').pop()+(t?'?'+t:'')})()+'">关闭故事线 ✕</a>';
  document.body.appendChild(b); document.body.classList.add('story-on');
})();
// ===== 来源 → 动作 → 去向 提示条（页面用 <body data-hint-step="N"> 声明；多步页如 "3 8" 按 URL step 选，无参数取第一个）=====
(function(){
  var HINT={
    1:{on:true, anchor:'.main',
       source:{text:'OD 编制获批 · HRBP 周晓 10/08', href:'hrbp.html'},
       action:'确认需求卡', target:'TA 陈静 · Sourcing',
       btn:'确认需求卡', dest:'→ 推给 TA 陈静',
       toast:'需求卡 v2 已确认，已推给 TA 陈静 · 进入第 2 步 Sourcing'},
    2:{on:true, anchor:'.main',
       source:{text:'需求卡 v2 · 王磊', href:'demand.html', step:1},
       action:'确认 Sourcing 人选', target:'简历评估 · Pipeline',
       btn:'全部纳入', dest:'→ 简历评估',
       toast:'8 位新人选（含赵敏）已纳入简历评估 · 第 3 步 Pipeline'},
    3:{on:true, anchor:'.pw', create:true,
       source:{text:'Sourcing · TA 陈静', href:'ta.html', step:2},
       action:'推进赵敏到一面', target:'面试官 王磊',
       btn:'推进赵敏到一面', dest:'→ 面试官 王磊',
       toast:'赵敏已推进到一面，面试日程已发到王磊飞书 · 第 4 步'},
    4:{on:true, role:'interviewer', anchor:'.doc', sticky:true,
       source:{text:'飞书待办 · 面试日程 · 王磊', href:'interviewer.html', step:3},
       action:'提交一面面评', target:'录用决策 · TA 陈静',
       btn:'确认打分并提交', dest:'→ 交给 TA 陈静',
       toast:'一面面评已提交，进入第 5 步录用决策 · 交给 TA 陈静'},
    5:{on:true, anchor:'.main',
       source:{text:'面评 · 王磊 / 何涛 / 周晓', href:'profile.html?role=ta', step:4},
       action:'发起决策会', target:'王磊、何涛 · 会后进 Offer',
       btn:'发起决策会', dest:'→ 王磊、何涛',
       toast:'决策会已约 10/16 15:00；会后提交结论 → 第 6 步 Offer 审批'},
    6:{on:true, anchor:'.doc',
       source:{text:'录用决策 · TA 陈静 10/16', href:'decision.html', step:5},
       action:'审批赵敏 Offer', target:'CHO 终审 → 发 Offer',
       btn:'同意', dest:'→ CHO',
       toast:'已同意，Offer 流转到 CHO 终审；通过后 TA 陈静发 Offer · 第 7 步背调'},
    7:{on:true, anchor:'.pw', create:true,
       source:{text:'Offer 已接受 · 赵敏', href:'approver-offer.html', step:6},
       action:'确认背调无异常', target:'入职 · HR',
       btn:'确认背调无异常', dest:'→ 入职',
       toast:'背调无异常，已通知 HR 办理入职 · 第 8 步'},
    8:{on:true, anchor:'.pw', create:true,
       source:{text:'背调通过 · 飞书通知', href:'feishu-card.html', step:7},
       action:'确认需求完成', target:'OD 编制已回写',
       btn:'确认需求完成', dest:'→ OD 编制已回写',
       toast:'需求已完成：OD 编制回写 13/15，招聘洞察回流 HRBP 周晓'}
  };
  var q=new URLSearchParams(location.search), story=q.get('story')==='1';
  var decl=(document.body.dataset.hintStep||'').split(/\s+/).map(Number).filter(Boolean);
  if(!decl.length) return;
  var us=parseInt(q.get('step')), hit=story&&decl.indexOf(us)>-1;
  if(decl.length>1&&!hit) return; // 多步页（如 pipeline）无 step 参数不显示
  var n=hit?us:decl[0], c=HINT[n];
  if(!c||!c.on) return;
  if(c.role && (q.get('role')||'ta')!==c.role) return;
  function sp(u,k){return story&&k?u+(u.indexOf('?')>-1?'&':'?')+'story=1&step='+k:u;}
  function stepUrl(k){var m={1:'demand.html',2:'ta.html',3:'pipeline.html',4:'profile.html?role=interviewer',5:'decision.html',6:'approver-offer.html',7:'feishu-card.html',8:'pipeline.html'};return sp(m[k],k);}
  document.body.classList.add('hint-on');
  var fb=document.createElement('div'); fb.className='flowbar';
  fb.innerHTML='<span>来自：</span><a href="'+(c.source.step&&story?stepUrl(c.source.step):c.source.href)+'">'+c.source.text+'</a><span class="ar">→</span><b>'+c.action+'</b><span class="ar">→</span><span>去向：'+c.target+'</span>';
  var host=document.querySelector(c.anchor); if(!host) return;
  if(c.anchor==='.doc') fb.style.cssText='width:860px;margin:0 auto 10px';
  host.insertBefore(fb,host.firstChild);
  var btn;
  if(c.create){
    var box=document.createElement('span');box.className='fbact';
    btn=document.createElement('span');btn.className='btn p';btn.textContent=c.btn;
    box.appendChild(btn);fb.appendChild(box);
  } else {
    btn=[].slice.call(document.querySelectorAll('.btn')).filter(function(b){return b.textContent.trim()===c.btn&&b.offsetParent!==null})[0];
  }
  if(!btn) return;
  btn.classList.add('p','main','pulse');
  var d=document.createElement('span');d.className='dest';d.textContent=c.dest;btn.insertAdjacentElement('afterend',d);
  if(c.sticky){var w=btn.parentNode;w.classList.add('hsticky');}
  btn.addEventListener('click',function(){
    var t=document.createElement('div');t.className='htoast';
    t.innerHTML='✓ '+c.toast+(n<8?'<a href="'+stepUrl(n+1)+'">去看 →</a>':'<a href="index.html">回总入口 →</a>');
    document.body.appendChild(t);requestAnimationFrame(function(){t.classList.add('on')});
    setTimeout(function(){t.classList.remove('on');setTimeout(function(){t.remove()},300)},3500);
  });
})();
