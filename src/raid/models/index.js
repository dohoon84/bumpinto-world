import { createWarriorModel } from '../warriorModel.js';
import { createMageModel } from './mage.js';
import { createPriestModel } from './priest.js';
import { createArcherModel } from './archer.js';
import { createAssassinModel } from './assassin.js';

const makers = {
  warrior: createWarriorModel,
  mage: createMageModel,
  priest: createPriestModel,
  archer: createArcherModel,
  assassin: createAssassinModel,
};

export function createClassModel(id, opts) {
  const make = makers[id] || makers.warrior;
  return make(opts);
}
