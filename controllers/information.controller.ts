import { Controller } from '@nestjs/common';
import { nestControllerContract, NestControllerInterface, TsRest } from '@ts-rest/nest';
import { informationContract } from 'commons-ephesus/contracts/supplier-api/information.contract';

const contract = nestControllerContract(informationContract);

@Controller()
export class InformationController implements NestControllerInterface<typeof contract> {
  @TsRest(contract.getPing)
  async getPing() {
    return {
      status: 200 as const,
      body: {
        isAlive: true,
      },
    };
  }
}
