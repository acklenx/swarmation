declare module '*/Info.svelte' {
  type Props = {
    score: number;
    successRate: number;
    countdown: number;
    formationName: string;
    formationMap: boolean[][];
  };

  class Info {
    constructor(params: {target: HTMLElement; props?: Props});
    $set(props: Partial<Props>): void;
  }

  export default Info;
}
