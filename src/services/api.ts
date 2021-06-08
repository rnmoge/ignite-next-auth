import axios, { AxiosError } from 'axios'
import { parseCookies, setCookie, destroyCookie } from 'nookies';
import { signOut } from '../contexts/AuthContext';
import { AuthTokenError } from './errors/AuthTokenError';

let isRefreshing = false;
let failedRequestsQueue = [] ;

export function setupAPIClient(ctx = undefined) {
  let cookies = parseCookies(ctx);

  const api = axios.create({
    baseURL: 'http://localhost:3333',
    headers: {
      Authorization: `Bearer ${cookies['nomeAplicacao.token']}`
    }
  });
  
  api.interceptors.response.use(response => {
    return response;
  }, (error: AxiosError) => {
    if (error.response.status === 401) {
      if (error.response.data?.code === 'token.expired'){
        //renovar o token
        cookies = parseCookies(ctx);
        const { 'nomeAplicacao.refreshToken': refreshToken } = cookies;
  
        const originalConfig = error.config;
  
        if (!isRefreshing){
          isRefreshing = true;
  
          //onsole.log('refreshToken ' + refreshToken)
  
          api.post('/refresh', {
            refreshToken,
          }).then(response => {
            //onsole.log(response)
            const { token } = response.data;
            
            setCookie(ctx, 'nomeAplicacao.token', token, {
              maxAge: 60 * 60 * 24 * 30, // 30 dias
              path: '/',        
            })
            setCookie(ctx, 'nomeAplicacao.refreshToken', response.data.refreshToken, {
              maxAge: 60 * 60 * 24 * 30, // 30 dias
              path: '/',        
            })
            
            api.defaults.headers['Authorization'] = `Bearer ${token}`;
    
            failedRequestsQueue.forEach(request => request.onSuccess(token));
            failedRequestsQueue = [];
          }).catch(err => {
            failedRequestsQueue.forEach(request => request.onFailure(err));
            failedRequestsQueue = [];
  
            if (process.browser) {
              signOut()
            }
          }).finally(() => {
            isRefreshing = false;
  
          });
        }
  
        return new Promise((resolve, reject) => {
          failedRequestsQueue.push({
            onSuccess: (token: string)  => {
              originalConfig.headers['Authorization'] = `Bearer ${token}`;
  
              resolve(api(originalConfig));
            },
            onFailure: (err: AxiosError) => {
              reject(err);
            }
          })
        })
  
      } else {
        //deslogar o usuário
        if (process.browser) {
          signOut()
        }else {
          return Promise.reject(new AuthTokenError())
        }
      }
    }
    return Promise.reject(error);
  });

  return api;
}