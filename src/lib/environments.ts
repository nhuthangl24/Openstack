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
    id: "php",
    label: "PHP",
    description: "PHP + CLI + FPM",
  },
  {
    id: "composer",
    label: "Composer",
    description: "Dependency manager for PHP",
  },
  {
    id: "go",
    label: "Go",
    description: "Golang programming language",
  },
  {
    id: "git",
    label: "Git",
    description: "Version control system",
  },
  {
    id: "mysql",
    label: "MySQL",
    description: "MySQL database server",
  },
  {
    id: "postgresql",
    label: "PostgreSQL",
    description: "Advanced open source database",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    description: "NoSQL document database",
  },
  {
    id: "redis",
    label: "Redis",
    description: "In-memory data structure store",
  },
  {
    id: "nginx",
    label: "Nginx",
    description: "High-performance web server",
  },
  {
    id: "apache2",
    label: "Apache2",
    description: "Classic web server",
  },
];
