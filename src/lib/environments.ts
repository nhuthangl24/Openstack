export interface Environment {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const environments: Environment[] = [
  {
    id: "docker",
    label: "Docker",
    icon: "🐳",
    description: "Container runtime engine",
  },
  {
    id: "nodejs",
    label: "NodeJS",
    icon: "🟢",
    description: "JavaScript runtime v20.x",
  },
  {
    id: "python",
    label: "Python",
    icon: "🐍",
    description: "Python 3 + pip",
  },
  {
    id: "mysql",
    label: "MySQL",
    icon: "🗄️",
    description: "MySQL database server",
  },
  {
    id: "nginx",
    label: "Nginx",
    icon: "⚡",
    description: "High-performance web server",
  },
];
