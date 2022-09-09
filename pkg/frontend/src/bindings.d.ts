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
