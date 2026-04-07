export interface Flavor {
  name: string;
  vcpus: number;
  ram: string;
  disk: string;
}

export const flavors: Flavor[] = [
  { name: "m1.nano", vcpus: 1, ram: "192 MB", disk: "1 GB" },
  { name: "m1.micro", vcpus: 1, ram: "256 MB", disk: "1 GB" },
  { name: "cirros256", vcpus: 1, ram: "256 MB", disk: "1 GB" },
  { name: "m1.tiny", vcpus: 1, ram: "512 MB", disk: "1 GB" },
  { name: "ds512M", vcpus: 1, ram: "512 MB", disk: "5 GB" },
  { name: "ds1G", vcpus: 1, ram: "1 GB", disk: "10 GB" },
  { name: "m1.small", vcpus: 1, ram: "2 GB", disk: "20 GB" },
  { name: "ds2G", vcpus: 2, ram: "2 GB", disk: "10 GB" },
  { name: "m1.medium", vcpus: 2, ram: "4 GB", disk: "40 GB" },
  { name: "ds4G", vcpus: 4, ram: "4 GB", disk: "20 GB" },
  { name: "m1.large", vcpus: 4, ram: "8 GB", disk: "80 GB" },
  { name: "m1.xlarge", vcpus: 8, ram: "16 GB", disk: "160 GB" },
];

export function formatFlavor(flavor: Flavor): string {
  return `${flavor.name} | ${flavor.vcpus} vCPU | ${flavor.ram} RAM | ${flavor.disk} Disk`;
}
