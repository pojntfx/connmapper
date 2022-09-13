declare function println(val: any): Promise<void>;

declare interface Packet {
  layerType: string;
  nextLayerType: string;
  length: number;
  srcIP: string;
  srcCountryName: string;
  srcCityName: string;
  srcLongitude: number;
  srcLatitude: number;
  dstIP: string;
  dstCountryName: string;
  dstCityName: string;
  dstLongitude: number;
  dstLatitude: number;
}

declare interface Configuration {
  arcDuration: number;
  localLongitude: number;
  localLatitude: number;
}

declare function getConfig(): Promise<Configuration>;
