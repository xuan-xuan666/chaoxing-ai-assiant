package com.work1.backend.ai;

/**
 * 模型客户端接口。
 *
 * 所有供应商差异（地址、鉴权、超时、错误码）都收敛在实现类里，
 * 业务层只依赖这个接口，换模型不需要改服务代码。
 */
public interface LlmClient {

    LlmResponse generate(LlmRequest request);
}
