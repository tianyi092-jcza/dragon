import { mountEditorNavigation } from "./navigation.js";
const $=id=>document.getElementById(id),gameId=new URLSearchParams(location.search).get('game') || null;
mountEditorNavigation({ moduleKey: "sources", gameId });
let snapshot=null,selectedSlot=null,ticket=0;
function clear(){snapshot=null;selectedSlot=null;for(const id of['records','references','bytes','chapter'])$(id).replaceChildren();for(const id of['identity','dates','warnings','record-info','limits'])$(id).textContent='';$('record-name').textContent='選擇來源記錄';}
function detail(record){
  selectedSlot=record.slot;for(const row of $('records').children)row.classList.toggle('selected',Number(row.dataset.slot)===selectedSlot);
  $('record-name').textContent=`G${record.slot} ${record.name}`;
  $('record-info').textContent=`來源ID：${record.id??'保留G127（非普通人物）'}\n原章：${snapshot.sourceChapterId}\n目標章：${snapshot.chapterId}\n來源顯示名：${record.sourceName??'保留記錄'}\n舊128字典槽名：${record.legacyName??'未記錄'}（不作人物身份）\n原byte武術／統率／政治：${record.ability.force}／${record.ability.lead}／${record.ability.politics}\n具名能力差異：${JSON.stringify(record.differences)}\n完整原32B：${record.originalRaw32}`;
  $('bytes').replaceChildren();for(let i=0;i<32;i++){const cell=document.createElement('span');cell.textContent=`${i.toString(16).padStart(2,'0')}: ${record.originalRaw32.slice(i*2,i*2+2)}`;cell.classList.toggle('unknown',record.unknownOffsets.includes(i));$('bytes').append(cell);}
  $('references').replaceChildren();for(const ref of record.references){const li=document.createElement('li');li.textContent=`${ref.kind}${ref.slot} ${ref.field} → G${ref.value}`;$('references').append(li);}if(!record.references.length){const li=document.createElement('li');li.textContent='列明C19/F01/F02未見引用；不代表無其它消費者。';$('references').append(li);}
  $('limits').textContent=snapshot.limits;
}
function rows(){
  $('records').replaceChildren();if(!snapshot?.available)return;
  const filter=$('search').value.trim().toLocaleLowerCase();
  for(const record of snapshot.records){if(filter&&!`${record.name} ${record.hao} ${record.id??''} G${record.slot}`.toLocaleLowerCase().includes(filter))continue;
    const row=document.createElement('tr');row.dataset.slot=record.slot;row.tabIndex=0;for(const value of[`G${record.slot}`,record.name,record.reserved?'保留兼容記錄':'獨立來源實例']){const td=document.createElement('td');td.textContent=value;row.append(td);}row.onclick=()=>detail(record);row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();detail(record);}};row.classList.toggle('selected',record.slot===selectedSlot);$('records').append(row);
  }
}
async function load(chapterId){
  const issued=++ticket;clear();$('status').textContent='讀取固定草稿快照…';
  try{
    if(!gameId)throw new Error('缺少遊戲ID，請從本地管理開啟。');
    const url='/api/entity-inspection?game='+encodeURIComponent(gameId)+(chapterId?'&chapter='+encodeURIComponent(chapterId):'');
    const response=await fetch(url,{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error??`HTTP ${response.status}`);if(issued!==ticket)return;
    snapshot=data;$('identity').textContent=`遊戲 ${data.gameId}／固定草稿修訂 ${data.revision}；重新載入才更新，不替換任何執行中對局。`;
    for(const chapter of data.chapters){const option=document.createElement('option');option.value=chapter.id;option.textContent=`${chapter.name} — ${chapter.sourceId}`;option.selected=chapter.id===data.chapterId;$('chapter').append(option);}
    if(!data.available){$('status').textContent=data.reason;return;}
    $('status').textContent='唯讀來源快照已載入';$('dates').textContent=`原來源日曆：${data.originalStart.year}/${data.originalStart.month}/${data.originalStart.day}；現模板：${data.templateStart.year}/${data.templateStart.month}/${data.templateStart.day}（差異只顯示，不自動糾正）`;
    $('warnings').textContent=`${data.records.length}原槽／127獨立來源ID／G127保留；舊字典${data.legacyDictionaryCount}條不是完整人物庫。${data.nonOrdinaryReferences.length}個非普通槽引用保留原byte，不虛構G255。`;
    rows();detail(data.records[0]);
  }catch(error){if(issued===ticket){clear();$('status').textContent='讀取被拒絕：'+error.message;}}
}
$('chapter').onchange=()=>load($('chapter').value);$('reload').onclick=()=>load(snapshot?.chapterId);$('search').oninput=rows;
load();
