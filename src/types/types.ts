export interface Topic1Data {
  _terminalTime: string;
  _groupName: string;
  [key: string]: string | number;
}

export interface SensorDatum {
  sensorsId: string;
  value?: string;
  switcher?: string;
}

export interface Topic2Data {
  sensorDatas: SensorDatum[];
}
