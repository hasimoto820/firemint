import {NativeModules} from 'react-native';
import type {WorkspaceProject} from '../shared/project';

type WorkspaceNative = {
  list: () => Promise<WorkspaceProject[]>;
  add: (
    projectId: string,
    label: string,
    readOnly: boolean,
  ) => Promise<WorkspaceProject>;
  update: (
    projectId: string,
    nextProjectId: string,
    label: string,
    readOnly: boolean,
  ) => Promise<WorkspaceProject>;
  remove: (projectId: string) => Promise<void>;
};

function native(): WorkspaceNative {
  const mod = NativeModules.Workspace as WorkspaceNative | undefined;
  if (!mod) {
    throw new Error('Workspace missing');
  }
  return mod;
}

export function listProjects(): Promise<WorkspaceProject[]> {
  return native().list();
}

export function addProject(
  projectId: string,
  label: string,
  readOnly: boolean,
): Promise<WorkspaceProject> {
  return native().add(projectId, label, readOnly);
}

// nextProjectId: 直した後のプロジェクトID。変えない時は、projectId と同じ値
export function updateProject(
  projectId: string,
  nextProjectId: string,
  label: string,
  readOnly: boolean,
): Promise<WorkspaceProject> {
  return native().update(projectId, nextProjectId, label, readOnly);
}

export function removeProject(projectId: string): Promise<void> {
  return native().remove(projectId);
}
