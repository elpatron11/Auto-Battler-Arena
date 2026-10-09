/* Cosmetics do not participate in squad rating identity or combat stats. */
(function(){
  'use strict';
  const snapshot=currentDefenseSnapshot;
  currentDefenseSnapshot=function(){
    const value=snapshot.apply(this,arguments);
    if(!value||!Array.isArray(value.heroes))return value;
    return {...value,heroes:value.heroes.map(hero=>({...hero,skinId:equippedSkin(hero.classId)}))};
  };
})();