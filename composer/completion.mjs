// An event-driven latch, not a polling loop. Busy work must call idle when it settles.
export function completionRecovery({current,isBusy,run}) {
  let pending=null,running=false,disposed=false;
  async function idle(){
    if(disposed||running||isBusy()||pending===null)return;
    const requested=pending;pending=null;
    if(current()?.key!==requested)return;
    running=true;
    try{await run(requested);}finally{
      running=false;
      // A completion may arrive during recovery itself. Drain that event once, serially.
      if(!disposed&&pending!==null)void idle();
    }
  }
  return {
    notify(sessionId){
      const scope=current();
      if(disposed||!scope||scope.sessionId!==sessionId)return;
      pending=scope.key;void idle();
    },
    idle,
    dispose(){disposed=true;pending=null;},
  };
}
