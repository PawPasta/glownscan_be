export type RoutineStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type RoutinePeriod = 'MORNING' | 'EVENING';

export interface RoutineStep {
  id: string;
  period: RoutinePeriod;
  position: number;
  title: string;
  instruction: string;
  optional: boolean;
  product: {
    id: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
  } | null;
}

export type RoutineStepInput = Omit<RoutineStep, 'id' | 'product'> & {
  id?: string;
  product?: RoutineStep['product'];
};

export interface Routine {
  id: string;
  title: string;
  status: RoutineStatus;
  morningSteps: RoutineStep[];
  eveningSteps: RoutineStep[];
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  completedAt: string | null;
}
