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
