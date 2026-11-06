import { PrismaService } from "@/infra/prisma/prisma.service";
import { Prisma } from "@devflow/db";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";

export type CreateProjectRequest = {
  projectName: string;
  projectKey: string;
  organizationId: string;
};

export type FindProjectInput = {
  projectId: string;
  organizationId: string;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProject(input: CreateProjectRequest) {
    const { projectName, projectKey, organizationId } = input;

    try {
      return await this.prisma.project.create({
        data: {
          key: projectKey,
          name: projectName,
          organization: {
            connect: {
              id: organizationId,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A project with this key already exists in this organization");
      }

      throw error;
    }
  }

  async findAll({ organizationId }: { organizationId: string }) {
    return this.prisma.project.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });
  }

  async findOne(input: FindProjectInput) {
    const { organizationId, projectId } = input;

    const project = await this.prisma.project.findFirst({
      where: {
        organizationId,
        id: projectId,
        deletedAt: null,
      },
    });

    if (project === null) {
      throw new NotFoundException("Not found");
    }

    return project;
  }
}
