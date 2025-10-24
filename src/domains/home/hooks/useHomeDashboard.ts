import { useEffect, useState } from 'react';
import {
  fetchHomeDashboardData,
  type HomeDashboardData,
} from '../services/homeDashboard';

interface HomeDashboardState {
  data: HomeDashboardData | null;
  isLoading: boolean;
  error: Error | null;
}

const useHomeDashboard = (): HomeDashboardState => {
  const [state, setState] = useState<HomeDashboardState>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    setState((previous) => ({ ...previous, isLoading: true }));

    fetchHomeDashboardData()
      .then((payload) => {
        if (!mounted) {
          return;
        }

        setState({ data: payload, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setState({ data: null, isLoading: false, error: error instanceof Error ? error : new Error('데이터 로딩에 실패했습니다.') });
      });

    return () => {
      mounted = false;
    };
  }, []);

  return state;
};

export default useHomeDashboard;
