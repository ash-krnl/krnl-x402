// ABI Types
export interface ABIInput {
  type: string;
  components?: ABIInput[];
}

export interface ABIFunction {
  type: string;
  name: string;
  inputs: ABIInput[];
}