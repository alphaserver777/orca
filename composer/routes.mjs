const build = ['clarify','plan','approval','implement','checks','review','acceptance','finish'];
export const QUICK_REVIEW_LINES = 120;

export const modes = {
  quick: {title:'Быстрая правка', steps:['implement','checks','review','acceptance','finish']},
  bug: {title:'Баг',steps:['clarify','reproduce','plan','approval','implement','checks','review','acceptance','finish']},
  task: {title:'Задача',steps:build},
  epic: {title:'Большая задача',steps:['clarify','design','approval','milestones','checks','review','acceptance','finish']},
  refactor: {title:'Рефакторинг',steps:['baseline',...build]},
  review: {title:'Ревью',steps:['review','acceptance']},
};

export const stages = {
  clarify:['Уточнение','Открытые вопросы по задаче'],
  plan:['План','Изменения и критерии готовности'],
  design:['План по этапам','Границы и критерии каждого этапа'],
  approval:['Утверждение плана','Ваше решение'],
  implement:['Реализация','Работа в отдельной копии'],
  milestones:['Реализация по этапам','Проверки после каждого этапа'],
  checks:['Проверки','Тесты и проверки проекта'],
  review:['Независимое ревью','Другой агент проверяет результат'],
  acceptance:['Приёмка','Ваше решение'],
  finish:['Завершение','Фиксация результата'],
  reproduce:['Воспроизведение','Тест, который показывает ошибку'],
  baseline:['Исходные проверки','Зафиксировать поведение до изменений'],
  visual:['Визуальная проверка','Проверить результат в браузере'],
};

// Same count as PurpleFlow 0.10.0 core/src/stages/checks.ts needsReview.
export function changedLines(actualDiff){
  return typeof actualDiff==='string'?actualDiff.split('\n').filter(line=>/^[+-][^+-]/.test(line)).length:null;
}
export function needsIndependentReview(mode,actualDiff){
  const count=changedLines(actualDiff);
  return mode!=='quick'||count===null||count>QUICK_REVIEW_LINES;
}

export function routePolicy(mode){
  return {correctionRounds:2,acceptance:'owner',
    ...(mode==='quick'?{independentReview:{basis:'actual-diff',operator:'>',lines:QUICK_REVIEW_LINES,countPattern:'^[+-][^+-]',unknown:'review'}}:{}),
    ...(mode==='epic'?{checksAfterEachPhase:true,finalChecks:true}:{}),
    ...(mode==='bug'?{confirmCauseBeforeImplement:true}:{}),
    ...(mode==='review'?{readOnly:true}:{}),
  };
}

export function stageDescription(mode,id){
  let [title,detail]=stages[id];
  if(mode==='quick'&&id==='review'){
    title=`Независимое ревью при diff > ${QUICK_REVIEW_LINES} строк`;
    detail=`После реализации измерить фактический diff задачи: добавленные и удалённые строки, без заголовков и служебных материалов. При ${QUICK_REVIEW_LINES} строках и меньше ревью пропускается; при большем diff обязательно. Пока размер не измерен, пропускать ревью нельзя.`;
  }
  if(mode==='epic'&&id==='milestones')detail='Реализация по согласованным этапам; после каждого этапа выполнить проверки и устранить ошибки до перехода к следующему.';
  if(mode==='epic'&&id==='checks'){title='Итоговые проверки';detail='После последнего этапа выполнить полные проверки результата; проверки каждого промежуточного этапа обязательны.';}
  if(mode==='bug'){
    if(id==='clarify'){title='Уточнение симптомов';detail='Уточнить ожидаемое и фактическое поведение, окружение и условия появления ошибки.';}
    if(id==='plan'){title='Причина и план исправления';detail='Установить и подтвердить причину воспроизводящим тестом; описать исправление и критерии проверки.';}
    if(id==='approval'){title='Согласование причины';detail='Владелец подтверждает установленную причину и план исправления до начала реализации.';}
  }
  return {id,title,detail,...mode==='quick'&&id==='review'?{conditional:true}:{}};
}

export function routeFor(mode,visual=false,actualDiff) {
  if (!Object.hasOwn(modes,mode)) throw new Error('Неизвестный режим');
  const steps = [...modes[mode].steps];
  if(mode==='quick'&&!needsIndependentReview(mode,actualDiff))steps.splice(steps.indexOf('review'),1);
  if (visual && mode !== 'review') steps.splice(steps.indexOf('acceptance'),0,'visual');
  return steps;
}

export function suggestMode(description) {
  const rules = [
    ['review', /^(проведи|сделай)?\s*(ревью|код.?ревью|review)|^проверь (код|изменения)/iu, 'Запрошена проверка существующих изменений.'],
    ['bug', /ошибк|ломается|падает|регресси|не работает|баг(?:$|[\s.,:])|\bbug\b/iu, 'В описании есть симптом ошибки.'],
    ['refactor', /рефактор|refactor|без изменения поведения/iu, 'Требуется сохранить существующее поведение.'],
    ['epic', /поэтапн|по этапам|несколько проектов|несколько этапов/iu, 'Работу предлагается разбить на этапы.'],
    ['quick', /опечатк|переименуй подпись|исправь надпись/iu, 'Описание указывает на небольшую локальную правку.'],
  ];
  for (const [mode,pattern,reason] of rules) if (pattern.test(description.trim())) return {mode,reason};
  return {mode:'task',reason:'Стандартный маршрут с планом, проверками и приёмкой.'};
}
