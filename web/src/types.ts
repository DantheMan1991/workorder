export type Status = 'draft' | 'ready' | 'in_progress' | 'complete';
export type Priority = 'low' | 'normal' | 'high';

export interface Task {
  id: string;
  text: string;
  done: boolean;
}
export interface Material {
  id: string;
  name: string;
  qty: number | string;
  unit: string;
  notes: string;
}
export interface Tool {
  id: string;
  name: string;
  qty: number | string;
  notes: string;
}
export interface CrewMember {
  id: string;
  name: string;
  role: string;
  hours: number | string;
}

export interface WorkOrder {
  id: string;
  number: string;
  title: string;
  status: Status;
  priority: Priority;
  customer: string;
  jobType: string;
  site: {
    address: string;
    accessNotes: string;
    parking: string;
    gateCode: string;
  };
  contact: {
    name: string;
    phone: string;
    role: string;
  };
  scheduledDate: string;
  startTime: string;
  estHours: number | string;
  scope: string;
  tasks: Task[];
  materials: Material[];
  tools: Tool[];
  crew: CrewMember[];
  safety: {
    ppe: string[];
    hazards: string;
    permits: string;
  };
  notes: string;
  completedPrompts: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In progress',
  complete: 'Complete',
};
