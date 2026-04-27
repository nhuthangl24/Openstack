export interface ServerPreset {
  key: string;
  label: string;
  description: string;
  flavor: string;
  environments: string[];
  namePrefix: string;
  highlights: string[];
}

export const serverPresets: ServerPreset[] = [
  {
    key: "docker-host",
    label: "Docker Host",
    description: "Máy chủ gọn nhẹ cho container, CI hoặc self-host app nhỏ.",
    flavor: "ds1G",
    environments: ["docker", "git"],
    namePrefix: "docker",
    highlights: ["Docker", "Git", "1 GB RAM"],
  },
  {
    key: "node-api",
    label: "Node API",
    description: "Sẵn Node.js, PM2 và Nginx để đưa service lên nhanh hơn.",
    flavor: "ds2G",
    environments: ["nodejs", "pm2", "nginx", "git"],
    namePrefix: "api",
    highlights: ["Node.js", "PM2", "Nginx"],
  },
  {
    key: "data-lab",
    label: "Data Lab",
    description: "Preset cho máy backend có database cache và tool dòng lệnh cơ bản.",
    flavor: "m1.medium",
    environments: ["python", "postgresql", "redis", "git"],
    namePrefix: "data",
    highlights: ["Python", "PostgreSQL", "Redis"],
  },
];
