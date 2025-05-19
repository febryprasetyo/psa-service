import { Topic2Data } from '../types/types';

export function extractSensorValues(data: Topic2Data) {
  const getVal = (id: string): number | null => {
    const entry = data.sensorDatas.find((d) => d.sensorsId === id);
    return entry?.value ? parseFloat(entry.value) : null;
  };

  return {
    runHour: getVal('2618057'),
    purity: getVal('2618034'),
    o2Tank: getVal('2618033'),
    totalFlow: getVal('2618037'),
  };
}
