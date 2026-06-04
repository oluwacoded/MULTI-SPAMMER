import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { BotSettings, BotSettingsUpdate, BotStatus, CampaignStartInput, CampaignStatus, HealthStatus, Login2faInput, LoginCodeInput, LoginStartInput, ScamAlertList, SimpleResult, SmmAuthResult, SmmDepositInit, SmmDepositInput, SmmDepositVerify, SmmLoginInput, SmmMeResult, SmmOrderInput, SmmOrderResult, SmmOrderStatus, SmmPanelOrderList, SmmRegisterInput, SmmServiceList, SmmWallet, SmsCampaignInput, SmsCampaignStatus, SmsFlashInput, SmsFlashResult, SmsHistoryList, SmsProviderList, VerifySmmDepositParams, Wallet, WalletTopupInput } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetBotStatusUrl: () => string;
/**
 * @summary Get bot connection status
 */
export declare const getBotStatus: (options?: RequestInit) => Promise<BotStatus>;
export declare const getGetBotStatusQueryKey: () => readonly ["/api/bot/status"];
export declare const getGetBotStatusQueryOptions: <TData = Awaited<ReturnType<typeof getBotStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBotStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getBotStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetBotStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getBotStatus>>>;
export type GetBotStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get bot connection status
 */
export declare function useGetBotStatus<TData = Awaited<ReturnType<typeof getBotStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getBotStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getDisconnectBotUrl: () => string;
/**
 * @summary Disconnect Telegram session
 */
export declare const disconnectBot: (options?: RequestInit) => Promise<SimpleResult>;
export declare const getDisconnectBotMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof disconnectBot>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof disconnectBot>>, TError, void, TContext>;
export type DisconnectBotMutationResult = NonNullable<Awaited<ReturnType<typeof disconnectBot>>>;
export type DisconnectBotMutationError = ErrorType<unknown>;
/**
* @summary Disconnect Telegram session
*/
export declare const useDisconnectBot: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof disconnectBot>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof disconnectBot>>, TError, void, TContext>;
export declare const getLoginStartUrl: () => string;
/**
 * @summary Start login with phone number
 */
export declare const loginStart: (loginStartInput: LoginStartInput, options?: RequestInit) => Promise<SimpleResult>;
export declare const getLoginStartMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof loginStart>>, TError, {
        data: BodyType<LoginStartInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof loginStart>>, TError, {
    data: BodyType<LoginStartInput>;
}, TContext>;
export type LoginStartMutationResult = NonNullable<Awaited<ReturnType<typeof loginStart>>>;
export type LoginStartMutationBody = BodyType<LoginStartInput>;
export type LoginStartMutationError = ErrorType<unknown>;
/**
* @summary Start login with phone number
*/
export declare const useLoginStart: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof loginStart>>, TError, {
        data: BodyType<LoginStartInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof loginStart>>, TError, {
    data: BodyType<LoginStartInput>;
}, TContext>;
export declare const getLoginCodeUrl: () => string;
/**
 * @summary Submit verification code
 */
export declare const loginCode: (loginCodeInput: LoginCodeInput, options?: RequestInit) => Promise<SimpleResult>;
export declare const getLoginCodeMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof loginCode>>, TError, {
        data: BodyType<LoginCodeInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof loginCode>>, TError, {
    data: BodyType<LoginCodeInput>;
}, TContext>;
export type LoginCodeMutationResult = NonNullable<Awaited<ReturnType<typeof loginCode>>>;
export type LoginCodeMutationBody = BodyType<LoginCodeInput>;
export type LoginCodeMutationError = ErrorType<unknown>;
/**
* @summary Submit verification code
*/
export declare const useLoginCode: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof loginCode>>, TError, {
        data: BodyType<LoginCodeInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof loginCode>>, TError, {
    data: BodyType<LoginCodeInput>;
}, TContext>;
export declare const getLogin2faUrl: () => string;
/**
 * @summary Submit 2FA password
 */
export declare const login2fa: (login2faInput: Login2faInput, options?: RequestInit) => Promise<SimpleResult>;
export declare const getLogin2faMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login2fa>>, TError, {
        data: BodyType<Login2faInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof login2fa>>, TError, {
    data: BodyType<Login2faInput>;
}, TContext>;
export type Login2faMutationResult = NonNullable<Awaited<ReturnType<typeof login2fa>>>;
export type Login2faMutationBody = BodyType<Login2faInput>;
export type Login2faMutationError = ErrorType<unknown>;
/**
* @summary Submit 2FA password
*/
export declare const useLogin2fa: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login2fa>>, TError, {
        data: BodyType<Login2faInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof login2fa>>, TError, {
    data: BodyType<Login2faInput>;
}, TContext>;
export declare const getGetCampaignStatusUrl: () => string;
/**
 * @summary Get Telegram campaign status
 */
export declare const getCampaignStatus: (options?: RequestInit) => Promise<CampaignStatus>;
export declare const getGetCampaignStatusQueryKey: () => readonly ["/api/campaign/status"];
export declare const getGetCampaignStatusQueryOptions: <TData = Awaited<ReturnType<typeof getCampaignStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCampaignStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCampaignStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCampaignStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getCampaignStatus>>>;
export type GetCampaignStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get Telegram campaign status
 */
export declare function useGetCampaignStatus<TData = Awaited<ReturnType<typeof getCampaignStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCampaignStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getStartCampaignApiUrl: () => string;
/**
 * @summary Start a Telegram bulk campaign
 */
export declare const startCampaignApi: (campaignStartInput: CampaignStartInput, options?: RequestInit) => Promise<SimpleResult>;
export declare const getStartCampaignApiMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startCampaignApi>>, TError, {
        data: BodyType<CampaignStartInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startCampaignApi>>, TError, {
    data: BodyType<CampaignStartInput>;
}, TContext>;
export type StartCampaignApiMutationResult = NonNullable<Awaited<ReturnType<typeof startCampaignApi>>>;
export type StartCampaignApiMutationBody = BodyType<CampaignStartInput>;
export type StartCampaignApiMutationError = ErrorType<unknown>;
/**
* @summary Start a Telegram bulk campaign
*/
export declare const useStartCampaignApi: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startCampaignApi>>, TError, {
        data: BodyType<CampaignStartInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startCampaignApi>>, TError, {
    data: BodyType<CampaignStartInput>;
}, TContext>;
export declare const getStopCampaignApiUrl: () => string;
/**
 * @summary Stop active Telegram campaign
 */
export declare const stopCampaignApi: (options?: RequestInit) => Promise<SimpleResult>;
export declare const getStopCampaignApiMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopCampaignApi>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopCampaignApi>>, TError, void, TContext>;
export type StopCampaignApiMutationResult = NonNullable<Awaited<ReturnType<typeof stopCampaignApi>>>;
export type StopCampaignApiMutationError = ErrorType<unknown>;
/**
* @summary Stop active Telegram campaign
*/
export declare const useStopCampaignApi: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopCampaignApi>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopCampaignApi>>, TError, void, TContext>;
export declare const getGetSmsCampaignStatusUrl: () => string;
/**
 * @summary Get SMS campaign status
 */
export declare const getSmsCampaignStatus: (options?: RequestInit) => Promise<SmsCampaignStatus>;
export declare const getGetSmsCampaignStatusQueryKey: () => readonly ["/api/sms/status"];
export declare const getGetSmsCampaignStatusQueryOptions: <TData = Awaited<ReturnType<typeof getSmsCampaignStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmsCampaignStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmsCampaignStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmsCampaignStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getSmsCampaignStatus>>>;
export type GetSmsCampaignStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get SMS campaign status
 */
export declare function useGetSmsCampaignStatus<TData = Awaited<ReturnType<typeof getSmsCampaignStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmsCampaignStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getStartSmsCampaignUrl: () => string;
/**
 * @summary Start an SMS campaign
 */
export declare const startSmsCampaign: (smsCampaignInput: SmsCampaignInput, options?: RequestInit) => Promise<SimpleResult>;
export declare const getStartSmsCampaignMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startSmsCampaign>>, TError, {
        data: BodyType<SmsCampaignInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startSmsCampaign>>, TError, {
    data: BodyType<SmsCampaignInput>;
}, TContext>;
export type StartSmsCampaignMutationResult = NonNullable<Awaited<ReturnType<typeof startSmsCampaign>>>;
export type StartSmsCampaignMutationBody = BodyType<SmsCampaignInput>;
export type StartSmsCampaignMutationError = ErrorType<unknown>;
/**
* @summary Start an SMS campaign
*/
export declare const useStartSmsCampaign: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startSmsCampaign>>, TError, {
        data: BodyType<SmsCampaignInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startSmsCampaign>>, TError, {
    data: BodyType<SmsCampaignInput>;
}, TContext>;
export declare const getStopSmsCampaignUrl: () => string;
/**
 * @summary Stop active SMS campaign
 */
export declare const stopSmsCampaign: (options?: RequestInit) => Promise<SimpleResult>;
export declare const getStopSmsCampaignMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopSmsCampaign>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopSmsCampaign>>, TError, void, TContext>;
export type StopSmsCampaignMutationResult = NonNullable<Awaited<ReturnType<typeof stopSmsCampaign>>>;
export type StopSmsCampaignMutationError = ErrorType<unknown>;
/**
* @summary Stop active SMS campaign
*/
export declare const useStopSmsCampaign: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopSmsCampaign>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopSmsCampaign>>, TError, void, TContext>;
export declare const getSendSmsFlashUrl: () => string;
/**
 * @summary Send a single SMS flash
 */
export declare const sendSmsFlash: (smsFlashInput: SmsFlashInput, options?: RequestInit) => Promise<SmsFlashResult>;
export declare const getSendSmsFlashMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendSmsFlash>>, TError, {
        data: BodyType<SmsFlashInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof sendSmsFlash>>, TError, {
    data: BodyType<SmsFlashInput>;
}, TContext>;
export type SendSmsFlashMutationResult = NonNullable<Awaited<ReturnType<typeof sendSmsFlash>>>;
export type SendSmsFlashMutationBody = BodyType<SmsFlashInput>;
export type SendSmsFlashMutationError = ErrorType<unknown>;
/**
* @summary Send a single SMS flash
*/
export declare const useSendSmsFlash: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendSmsFlash>>, TError, {
        data: BodyType<SmsFlashInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof sendSmsFlash>>, TError, {
    data: BodyType<SmsFlashInput>;
}, TContext>;
export declare const getGetSmsProvidersUrl: () => string;
/**
 * @summary Get configured SMS providers
 */
export declare const getSmsProviders: (options?: RequestInit) => Promise<SmsProviderList>;
export declare const getGetSmsProvidersQueryKey: () => readonly ["/api/sms/providers"];
export declare const getGetSmsProvidersQueryOptions: <TData = Awaited<ReturnType<typeof getSmsProviders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmsProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmsProviders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmsProvidersQueryResult = NonNullable<Awaited<ReturnType<typeof getSmsProviders>>>;
export type GetSmsProvidersQueryError = ErrorType<unknown>;
/**
 * @summary Get configured SMS providers
 */
export declare function useGetSmsProviders<TData = Awaited<ReturnType<typeof getSmsProviders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmsProviders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSmsHistoryUrl: () => string;
/**
 * @summary Get SMS send history
 */
export declare const getSmsHistory: (options?: RequestInit) => Promise<SmsHistoryList>;
export declare const getGetSmsHistoryQueryKey: () => readonly ["/api/sms/history"];
export declare const getGetSmsHistoryQueryOptions: <TData = Awaited<ReturnType<typeof getSmsHistory>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmsHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmsHistory>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmsHistoryQueryResult = NonNullable<Awaited<ReturnType<typeof getSmsHistory>>>;
export type GetSmsHistoryQueryError = ErrorType<unknown>;
/**
 * @summary Get SMS send history
 */
export declare function useGetSmsHistory<TData = Awaited<ReturnType<typeof getSmsHistory>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmsHistory>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSettingsUrl: () => string;
/**
 * @summary Get bot settings
 */
export declare const getSettings: (options?: RequestInit) => Promise<BotSettings>;
export declare const getGetSettingsQueryKey: () => readonly ["/api/settings"];
export declare const getGetSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
export type GetSettingsQueryError = ErrorType<unknown>;
/**
 * @summary Get bot settings
 */
export declare function useGetSettings<TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getUpdateSettingsUrl: () => string;
/**
 * @summary Update bot settings
 */
export declare const updateSettings: (botSettingsUpdate: BotSettingsUpdate, options?: RequestInit) => Promise<BotSettings>;
export declare const getUpdateSettingsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<BotSettingsUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<BotSettingsUpdate>;
}, TContext>;
export type UpdateSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateSettings>>>;
export type UpdateSettingsMutationBody = BodyType<BotSettingsUpdate>;
export type UpdateSettingsMutationError = ErrorType<unknown>;
/**
* @summary Update bot settings
*/
export declare const useUpdateSettings: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<BotSettingsUpdate>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<BotSettingsUpdate>;
}, TContext>;
export declare const getGetWalletUrl: (userId: string) => string;
/**
 * @summary Get wallet for user
 */
export declare const getWallet: (userId: string, options?: RequestInit) => Promise<Wallet>;
export declare const getGetWalletQueryKey: (userId: string) => readonly [`/api/wallet/${string}`];
export declare const getGetWalletQueryOptions: <TData = Awaited<ReturnType<typeof getWallet>>, TError = ErrorType<unknown>>(userId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWallet>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getWallet>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetWalletQueryResult = NonNullable<Awaited<ReturnType<typeof getWallet>>>;
export type GetWalletQueryError = ErrorType<unknown>;
/**
 * @summary Get wallet for user
 */
export declare function useGetWallet<TData = Awaited<ReturnType<typeof getWallet>>, TError = ErrorType<unknown>>(userId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getWallet>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getWalletTopupUrl: () => string;
/**
 * @summary Top up a wallet
 */
export declare const walletTopup: (walletTopupInput: WalletTopupInput, options?: RequestInit) => Promise<SimpleResult>;
export declare const getWalletTopupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof walletTopup>>, TError, {
        data: BodyType<WalletTopupInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof walletTopup>>, TError, {
    data: BodyType<WalletTopupInput>;
}, TContext>;
export type WalletTopupMutationResult = NonNullable<Awaited<ReturnType<typeof walletTopup>>>;
export type WalletTopupMutationBody = BodyType<WalletTopupInput>;
export type WalletTopupMutationError = ErrorType<unknown>;
/**
* @summary Top up a wallet
*/
export declare const useWalletTopup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof walletTopup>>, TError, {
        data: BodyType<WalletTopupInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof walletTopup>>, TError, {
    data: BodyType<WalletTopupInput>;
}, TContext>;
export declare const getGetSmmServicesUrl: () => string;
/**
 * @summary List all SMM services grouped by category
 */
export declare const getSmmServices: (options?: RequestInit) => Promise<SmmServiceList>;
export declare const getGetSmmServicesQueryKey: () => readonly ["/api/smm/services"];
export declare const getGetSmmServicesQueryOptions: <TData = Awaited<ReturnType<typeof getSmmServices>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmServices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmmServices>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmmServicesQueryResult = NonNullable<Awaited<ReturnType<typeof getSmmServices>>>;
export type GetSmmServicesQueryError = ErrorType<unknown>;
/**
 * @summary List all SMM services grouped by category
 */
export declare function useGetSmmServices<TData = Awaited<ReturnType<typeof getSmmServices>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmServices>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getPlaceSmmOrderUrl: () => string;
/**
 * @summary Place a new SMM order
 */
export declare const placeSmmOrder: (smmOrderInput: SmmOrderInput, options?: RequestInit) => Promise<SmmOrderResult>;
export declare const getPlaceSmmOrderMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof placeSmmOrder>>, TError, {
        data: BodyType<SmmOrderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof placeSmmOrder>>, TError, {
    data: BodyType<SmmOrderInput>;
}, TContext>;
export type PlaceSmmOrderMutationResult = NonNullable<Awaited<ReturnType<typeof placeSmmOrder>>>;
export type PlaceSmmOrderMutationBody = BodyType<SmmOrderInput>;
export type PlaceSmmOrderMutationError = ErrorType<unknown>;
/**
* @summary Place a new SMM order
*/
export declare const usePlaceSmmOrder: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof placeSmmOrder>>, TError, {
        data: BodyType<SmmOrderInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof placeSmmOrder>>, TError, {
    data: BodyType<SmmOrderInput>;
}, TContext>;
export declare const getGetSmmOrderStatusUrl: (orderId: string) => string;
/**
 * @summary Check order status
 */
export declare const getSmmOrderStatus: (orderId: string, options?: RequestInit) => Promise<SmmOrderStatus>;
export declare const getGetSmmOrderStatusQueryKey: (orderId: string) => readonly [`/api/smm/order/${string}`];
export declare const getGetSmmOrderStatusQueryOptions: <TData = Awaited<ReturnType<typeof getSmmOrderStatus>>, TError = ErrorType<unknown>>(orderId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmOrderStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmmOrderStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmmOrderStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getSmmOrderStatus>>>;
export type GetSmmOrderStatusQueryError = ErrorType<unknown>;
/**
 * @summary Check order status
 */
export declare function useGetSmmOrderStatus<TData = Awaited<ReturnType<typeof getSmmOrderStatus>>, TError = ErrorType<unknown>>(orderId: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmOrderStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSmmOrdersUrl: () => string;
/**
 * @summary List the authenticated buyer's orders
 */
export declare const getSmmOrders: (options?: RequestInit) => Promise<SmmPanelOrderList>;
export declare const getGetSmmOrdersQueryKey: () => readonly ["/api/smm/orders"];
export declare const getGetSmmOrdersQueryOptions: <TData = Awaited<ReturnType<typeof getSmmOrders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmOrders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmmOrders>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmmOrdersQueryResult = NonNullable<Awaited<ReturnType<typeof getSmmOrders>>>;
export type GetSmmOrdersQueryError = ErrorType<unknown>;
/**
 * @summary List the authenticated buyer's orders
 */
export declare function useGetSmmOrders<TData = Awaited<ReturnType<typeof getSmmOrders>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmOrders>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSmmRegisterUrl: () => string;
/**
 * @summary Create a buyer account
 */
export declare const smmRegister: (smmRegisterInput: SmmRegisterInput, options?: RequestInit) => Promise<SmmAuthResult>;
export declare const getSmmRegisterMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof smmRegister>>, TError, {
        data: BodyType<SmmRegisterInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof smmRegister>>, TError, {
    data: BodyType<SmmRegisterInput>;
}, TContext>;
export type SmmRegisterMutationResult = NonNullable<Awaited<ReturnType<typeof smmRegister>>>;
export type SmmRegisterMutationBody = BodyType<SmmRegisterInput>;
export type SmmRegisterMutationError = ErrorType<unknown>;
/**
* @summary Create a buyer account
*/
export declare const useSmmRegister: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof smmRegister>>, TError, {
        data: BodyType<SmmRegisterInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof smmRegister>>, TError, {
    data: BodyType<SmmRegisterInput>;
}, TContext>;
export declare const getSmmLoginUrl: () => string;
/**
 * @summary Log in to a buyer account
 */
export declare const smmLogin: (smmLoginInput: SmmLoginInput, options?: RequestInit) => Promise<SmmAuthResult>;
export declare const getSmmLoginMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof smmLogin>>, TError, {
        data: BodyType<SmmLoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof smmLogin>>, TError, {
    data: BodyType<SmmLoginInput>;
}, TContext>;
export type SmmLoginMutationResult = NonNullable<Awaited<ReturnType<typeof smmLogin>>>;
export type SmmLoginMutationBody = BodyType<SmmLoginInput>;
export type SmmLoginMutationError = ErrorType<unknown>;
/**
* @summary Log in to a buyer account
*/
export declare const useSmmLogin: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof smmLogin>>, TError, {
        data: BodyType<SmmLoginInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof smmLogin>>, TError, {
    data: BodyType<SmmLoginInput>;
}, TContext>;
export declare const getGetSmmMeUrl: () => string;
/**
 * @summary Get the authenticated buyer
 */
export declare const getSmmMe: (options?: RequestInit) => Promise<SmmMeResult>;
export declare const getGetSmmMeQueryKey: () => readonly ["/api/smm/auth/me"];
export declare const getGetSmmMeQueryOptions: <TData = Awaited<ReturnType<typeof getSmmMe>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmmMe>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmmMeQueryResult = NonNullable<Awaited<ReturnType<typeof getSmmMe>>>;
export type GetSmmMeQueryError = ErrorType<unknown>;
/**
 * @summary Get the authenticated buyer
 */
export declare function useGetSmmMe<TData = Awaited<ReturnType<typeof getSmmMe>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmMe>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetSmmWalletUrl: () => string;
/**
 * @summary Get the buyer's wallet balance and ledger
 */
export declare const getSmmWallet: (options?: RequestInit) => Promise<SmmWallet>;
export declare const getGetSmmWalletQueryKey: () => readonly ["/api/smm/wallet"];
export declare const getGetSmmWalletQueryOptions: <TData = Awaited<ReturnType<typeof getSmmWallet>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmWallet>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSmmWallet>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSmmWalletQueryResult = NonNullable<Awaited<ReturnType<typeof getSmmWallet>>>;
export type GetSmmWalletQueryError = ErrorType<unknown>;
/**
 * @summary Get the buyer's wallet balance and ledger
 */
export declare function useGetSmmWallet<TData = Awaited<ReturnType<typeof getSmmWallet>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSmmWallet>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getInitiateSmmDepositUrl: () => string;
/**
 * @summary Start a Flutterwave wallet deposit
 */
export declare const initiateSmmDeposit: (smmDepositInput: SmmDepositInput, options?: RequestInit) => Promise<SmmDepositInit>;
export declare const getInitiateSmmDepositMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof initiateSmmDeposit>>, TError, {
        data: BodyType<SmmDepositInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof initiateSmmDeposit>>, TError, {
    data: BodyType<SmmDepositInput>;
}, TContext>;
export type InitiateSmmDepositMutationResult = NonNullable<Awaited<ReturnType<typeof initiateSmmDeposit>>>;
export type InitiateSmmDepositMutationBody = BodyType<SmmDepositInput>;
export type InitiateSmmDepositMutationError = ErrorType<unknown>;
/**
* @summary Start a Flutterwave wallet deposit
*/
export declare const useInitiateSmmDeposit: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof initiateSmmDeposit>>, TError, {
        data: BodyType<SmmDepositInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof initiateSmmDeposit>>, TError, {
    data: BodyType<SmmDepositInput>;
}, TContext>;
export declare const getVerifySmmDepositUrl: (params: VerifySmmDepositParams) => string;
/**
 * @summary Verify and credit a Flutterwave deposit
 */
export declare const verifySmmDeposit: (params: VerifySmmDepositParams, options?: RequestInit) => Promise<SmmDepositVerify>;
export declare const getVerifySmmDepositQueryKey: (params?: VerifySmmDepositParams) => readonly ["/api/smm/deposit/verify", ...VerifySmmDepositParams[]];
export declare const getVerifySmmDepositQueryOptions: <TData = Awaited<ReturnType<typeof verifySmmDeposit>>, TError = ErrorType<unknown>>(params: VerifySmmDepositParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof verifySmmDeposit>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof verifySmmDeposit>>, TError, TData> & {
    queryKey: QueryKey;
};
export type VerifySmmDepositQueryResult = NonNullable<Awaited<ReturnType<typeof verifySmmDeposit>>>;
export type VerifySmmDepositQueryError = ErrorType<unknown>;
/**
 * @summary Verify and credit a Flutterwave deposit
 */
export declare function useVerifySmmDeposit<TData = Awaited<ReturnType<typeof verifySmmDeposit>>, TError = ErrorType<unknown>>(params: VerifySmmDepositParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof verifySmmDeposit>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetScamLogUrl: () => string;
/**
 * @summary Get scam alert log
 */
export declare const getScamLog: (options?: RequestInit) => Promise<ScamAlertList>;
export declare const getGetScamLogQueryKey: () => readonly ["/api/scam/log"];
export declare const getGetScamLogQueryOptions: <TData = Awaited<ReturnType<typeof getScamLog>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScamLog>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getScamLog>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetScamLogQueryResult = NonNullable<Awaited<ReturnType<typeof getScamLog>>>;
export type GetScamLogQueryError = ErrorType<unknown>;
/**
 * @summary Get scam alert log
 */
export declare function useGetScamLog<TData = Awaited<ReturnType<typeof getScamLog>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getScamLog>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map