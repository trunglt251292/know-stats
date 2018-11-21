import Request from 'request-promise'
import axios from 'axios'

/**
 * Param:
 * uri  - require
 * method - require
 * */
// export async function request(options){
//   try{
//     console.log('Request API - ', options.uri);
//     let data = await Request(options);
//     return data.body;
//   }catch (err){
//    return Promise.reject('Error Request ',options.uri)
//   }
//
//   // return new Promise((resolve,reject)=>{
//   //   Request(options, (err, data)=>{
//   //     if(err){
//   //       reject(err);
//   //     }
//   //     if(data) {
//   //       resolve(data.body);
//   //     }
//   //   })
//   // })
// }

export async function request(option, data) {
  try {
    const axiosInstance = axios.create({
      baseURL: option.uri,
      timeout: 15000,
    });
    const response = await axiosInstance({
      url:option.url,
      method: option.method || 'get',
      data,
      headers: {
        'Content-Type': option.contentType || 'application/json',
      },
    });
    return response.data
  } catch (err) {
    if (err.response) return err.response.data;
    return Promise.reject('Net Work Error Connect');
  }
}