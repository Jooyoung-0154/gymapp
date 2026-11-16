// [목적] app.js 파일: 서버가 제공하는 웹 화면의 인증·회원 관리 이벤트를 연결합니다. API 요청과 오류 표시, 운영자 추가 인증을 처리합니다.
'use strict';
const $=id=>document.getElementById(id);
let challengeId=null,currentIssue=null,issued=null,currentStatus=null,statusPending=false;
const requestKeys=new Map();
// [기능] notice 함수: 공통 안내 영역의 문구와 표시 여부를 갱신합니다.
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
// [기능] api 함수: CSRF 토큰과 쿠키를 포함해 API를 호출하고 응답 오류를 화면 처리용 예외로 바꿉니다.
// [기능] api는 변경 요청마다 현재 쿠키에 맞는 CSRF 토큰을 조회합니다.
// [목적] 다른 탭·로그인 전환으로 오래된 토큰이 남아 회원 등록을 막지 않게 합니다.
async function api(path,body,csrfRetried=false){
  const options={credentials:'same-origin',headers:{}};
  let identity;
  if(body!==undefined){
    const tokenResponse=await fetch('/api/v1/auth/csrf',{credentials:'same-origin',cache:'no-store'});
    if(!tokenResponse.ok)throw new Error('요청 인증을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
    const csrf=(await tokenResponse.json()).data;
    identity=path+JSON.stringify(body);
    if(!requestKeys.has(identity))requestKeys.set(identity,crypto.randomUUID());
    options.method='POST';options.headers={'Content-Type':'application/json',[csrf.headerName]:csrf.token,'Idempotency-Key':requestKeys.get(identity)};options.body=JSON.stringify(body);
  }
  let response;
  try{response=await fetch('/api/v1'+path,options);}catch{throw new Error('처리 결과를 확인하지 못했어요. 같은 내용으로 다시 시도해 주세요.');}
  const payload=await response.json();
  // [목적] 서버가 업무 처리 전에 CSRF 검증으로 거절한 경우에만 같은 요청키로 한 번 재시도합니다.
  // 권한 부족·업무 오류·결과가 불명확한 네트워크 실패는 자동 재전송하지 않습니다.
  if(body!==undefined && response.status===403 && payload.error?.code==='CSRF_INVALID' && !csrfRetried){
    return api(path,body,true);
  }
  if(identity)requestKeys.delete(identity);
  if(!response.ok){const error=new Error(payload.error?.message||'처리하지 못했어요.');error.code=payload.error?.code;if(response.status===401 && !path.startsWith('/auth/'))await showAuth();throw error;}
  return payload.data;
}
// [목적] formHandler 함수: 폼 기본 제출을 막고 비동기 동작 중 버튼 비활성화와 오류 표시를 공통 처리합니다.
function formHandler(id,action){$(id).addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;notice('');try{await action(new FormData(event.target));}catch(error){const output=$(id).closest('dialog')?.querySelector('[data-form-notice]');if(output)output.textContent=error.message;else notice(error.message);}finally{button.disabled=false;}});}
// [기능] authTab 함수: 로그인·활성화 폼의 표시와 선택 탭 상태를 전환합니다.
function authTab(activate){$('login-form').hidden=activate;$('activate-form').hidden=!activate;$('mfa-form').hidden=true;$('login-tab').classList.toggle('selected',!activate);$('activate-tab').classList.toggle('selected',activate);notice('');}
// [기능] showAuth 함수: 회원·운영자 영역을 숨기고 로그인 화면으로 돌아갑니다.
async function showAuth(){for(const id of ['admin-view','member-view'])$(id).hidden=true;$('auth-view').hidden=false;challengeId=null;authTab(false);}
// [기능] loadMe 함수: 현재 계정을 조회하고 역할에 따라 운영자 또는 회원 화면을 표시합니다.
async function loadMe(){const me=await api('/me');$('auth-view').hidden=true;notice('');if(me.roles.includes('OPERATOR')){$('admin-view').hidden=false;$('member-view').hidden=true;await refreshMembers();}else{$('admin-view').hidden=true;$('member-view').hidden=false;$('welcome-name').textContent=`${me.name}님, 반가워요.`;$('profile-name').textContent=me.name;$('profile-phone').textContent=me.phone;}}
$('login-tab').addEventListener('click',()=>authTab(false));$('activate-tab').addEventListener('click',()=>authTab(true));$('mfa-back').addEventListener('click',()=>{challengeId=null;authTab(false);});
formHandler('login-form',async form=>{const data=await api('/auth/login',{phone:form.get('phone'),password:form.get('password')});$('login-password').value='';if(data.mfaRequired){challengeId=data.challengeId;$('login-form').hidden=true;$('mfa-form').hidden=false;$('mfa-code').value='';$('mfa-code').focus();}else await loadMe();});
formHandler('mfa-form',async form=>{await api('/auth/mfa/verify',{challengeId,totp:form.get('totp')});$('mfa-code').value='';challengeId=null;await loadMe();});
formHandler('activate-form',async form=>{if(form.get('newPassword')!==$('confirm-password').value)throw new Error('비밀번호 확인이 일치하지 않아요.');await api('/auth/code/consume',{challengeId:form.get('challengeId'),code:form.get('code'),newPassword:form.get('newPassword')});$('activate-form').reset();authTab(false);notice('비밀번호를 설정했어요. 등록된 휴대전화번호로 로그인해 주세요.');});
document.querySelectorAll('.logout').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await api('/auth/logout',{});await showAuth();}catch(error){notice(error.message);}finally{button.disabled=false;}}));
formHandler('register-form',async form=>{await api('/admin/members',{name:form.get('name'),phone:form.get('phone'),age14Verified:$('age-confirm').checked});$('register-form').reset();await refreshMembers();notice('회원을 등록했어요. 목록에서 승인한 뒤 활성화 코드를 발급하세요.');});
// [기능] element 함수: DOM 요소를 만들며 문자는 textContent로 넣어 HTML로 해석되지 않게 합니다.
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
// [기능] refreshMembers 함수: 서버에서 회원 목록을 다시 받아 화면의 목록을 구성합니다.
async function refreshMembers(){
  $('member-list').replaceChildren(element('p','empty','회원 목록을 불러오는 중이에요.'));
  try{const data=await api('/admin/members');$('member-count').textContent=data.items.length;$('member-list').replaceChildren();if(!data.items.length)$('member-list').append(element('p','empty','아직 등록된 회원이 없어요.\n새 회원을 등록해 보세요.'));
    for(const member of data.items){const card=element('article','member'),top=element('div','member-top'),info=element('div');info.append(element('p','member-name',member.name),element('p','member-phone',member.phone));const label=member.status==='SUSPENDED'?'이용 정지':member.status==='PENDING'?'승인 대기':member.accountStatus==='PENDING'?'활성화 대기':'이용 가능';top.append(info,element('span','badge'+(member.status==='SUSPENDED'?' suspended':member.accountStatus==='ACTIVE'?' active':''),label));card.append(top);const actions=element('div','member-actions');
      if(member.status!=='ACTIVE')actions.append(actionButton('회원 승인',()=>changeStatus(member,'ACTIVE')));
      if(member.status==='ACTIVE'){actions.append(actionButton(member.accountStatus==='PENDING'?'활성화 코드':'비밀번호 재설정',()=>openCode(member)));actions.append(actionButton('이용 정지',()=>changeStatus(member,'SUSPENDED')));}
      card.append(actions);$('member-list').append(card);}
  }catch(error){$('member-list').replaceChildren(element('p','empty','목록을 가져오지 못했어요. 새로고침으로 다시 시도해 주세요.'));throw error;}
}
// [목적] actionButton 함수: 중복 클릭 방지와 오류 처리가 포함된 작업 버튼을 만듭니다.
function actionButton(label,action){const button=element('button','outline',label);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;notice('');try{await action();}catch(error){notice(error.message);}finally{button.disabled=false;}});return button;}
// [기능] changeStatus는 회원 승인·정지 사유를 페이지 안의 모달에서 입력받습니다.
// [목적] 내장 브라우저가 지원하지 않는 네이티브 입력창에 의존하지 않습니다.
function changeStatus(member,status){
  currentStatus={member,status};
  $('status-form').reset();
  $('status-title').textContent=status==='ACTIVE'?'회원 승인':'이용 정지';
  $('status-member').textContent=member.name+' · '+member.phone;
  $('status-submit').textContent=status==='ACTIVE'?'승인하기':'이용 정지하기';
  $('status-notice').textContent='';
  $('status-dialog').showModal();
  $('status-reason').focus();
}
function closeStatus(){
  if(statusPending)return;
  $('status-dialog').close();$('status-form').reset();currentStatus=null;
}
$('status-cancel').addEventListener('click',closeStatus);
$('status-dialog').addEventListener('cancel',event=>{
  if(statusPending){event.preventDefault();return;}
  $('status-form').reset();currentStatus=null;
});
formHandler('status-form',async form=>{
  if(statusPending || !currentStatus)return;
  const reason=String(form.get('reason')||'').trim();
  if(!reason)throw new Error('처리 사유를 입력해 주세요.');
  const {member,status}=currentStatus;
  statusPending=true;$('status-cancel').disabled=true;$('status-notice').textContent='';
  try{
    await api('/admin/accounts/'+member.accountId+'/status',{status,reason,expectedVersion:member.version});
  }finally{statusPending=false;$('status-cancel').disabled=false;}
  closeStatus();
  try{await refreshMembers();notice(status==='ACTIVE'?'회원을 승인했어요. 활성화 코드를 발급해 주세요.':'회원의 이용을 정지했어요.');}
  catch{notice('상태 변경은 완료됐어요. 회원 목록을 새로고침해 주세요.');}
});
$('refresh-members').addEventListener('click',async event=>{event.target.disabled=true;try{await refreshMembers();}catch(error){notice(error.message);}finally{event.target.disabled=false;}});
// [기능] openCode 함수: 선택 회원의 코드 발급 모달을 초기화하고 표시합니다.
function openCode(member){currentIssue=member;issued=null;$('issue-form').hidden=false;$('issued-result').hidden=true;$('reauth-form').hidden=true;$('dialog-notice').textContent='';$('identity-confirm').checked=false;$('issue-title').textContent='일회용 코드 발급';$('issue-member').textContent=`${member.name} · ${member.phone}`;$('issue-purpose').value=member.accountStatus==='PENDING'?'ACTIVATE':'RESET';$('code-dialog').showModal();}
// [기능] closeCode 함수: 발급 모달을 닫고 화면에 남은 코드와 재인증 입력을 지웁니다.
function closeCode(){$('code-dialog').close();$('issued-code').textContent='';$('issued-id').textContent='';$('reauth-form').reset();issued=null;currentIssue=null;}
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',closeCode));$('code-dialog').addEventListener('cancel',()=>{$('issued-code').textContent='';issued=null;currentIssue=null;});
formHandler('issue-form',async()=>{try{issued=await api(`/admin/accounts/${currentIssue.accountId}/codes`,{purpose:$('issue-purpose').value,identityVerified:$('identity-confirm').checked,reason:$('issue-reason').value});}catch(error){if(error.code==='REAUTH_REQUIRED'){$('reauth-form').hidden=false;$('reauth-password').focus();}throw error;}$('issue-form').hidden=true;$('reauth-form').hidden=true;$('issued-result').hidden=false;$('dialog-notice').textContent='';$('issued-id').textContent=issued.challengeId;$('issued-code').textContent=issued.code;$('issued-expiry').textContent=`유효 기한: ${new Date(issued.expiresAt).toLocaleString('ko-KR')}`;});
formHandler('reauth-form',async form=>{await api('/auth/reauthenticate',{password:form.get('password'),totp:form.get('totp')});$('reauth-form').reset();$('reauth-form').hidden=true;$('dialog-notice').textContent='본인 인증을 마쳤어요. 위의 코드 발급 버튼을 눌러 주세요.';});
$('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(`발급 식별자: ${issued.challengeId}\n일회용 코드: ${issued.code}\n유효 기한: ${new Date(issued.expiresAt).toLocaleString('ko-KR')}`);$('dialog-notice').textContent='복사했어요.';}catch{$('dialog-notice').textContent='복사하지 못했어요. 발급 정보를 직접 선택해 복사해 주세요.';}});
loadMe().catch(()=>showAuth());


